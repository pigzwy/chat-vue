import { randomUUID } from 'node:crypto'
import { sub2apiBaseURL } from './sub2api'
import { withImageRequestTimeout } from './imageUpstreamRequest'
import { buildImagePrompt, type ImageQuality, type ImageRatio, type ImageResolution } from '../../shared/utils/images'

type ImageJobStatus = 'queued' | 'running' | 'completed' | 'error'
type ImageJobKind = 'generation' | 'edit'

interface GeneratedImage {
  b64_json?: string
  url?: string
  revised_prompt?: string
}

interface ImageGenerationResponse {
  data?: GeneratedImage[]
  error?: {
    message?: string
  }
  message?: string
}

interface ImageStreamEvent extends GeneratedImage {
  message?: string
  error?: {
    message?: string
  }
  data?: GeneratedImage[]
}

export interface ImageJobInput {
  apiKey: string
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  size: string
  quality: ImageQuality
}

export interface ImageEditJobInput extends ImageJobInput {
  images: File[]
}

export interface ImageJob extends ImageJobInput {
  id: string
  kind: ImageJobKind
  status: ImageJobStatus
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  errorStatus?: number
  images?: File[]
  data?: GeneratedImage[]
  mode?: 'stream' | 'sync'
  streamAttempts?: number
}

interface RequestError extends Error {
  status?: number
  streamStarted?: boolean
  retryableStream?: boolean
}

const imageModel = 'gpt-image-2'
const maxJobAgeMs = 1000 * 60 * 60
const imageJobs = new Map<string, ImageJob>()
const imageLogPrefix = '[image-job]'

function getElapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt)
}

function logImageJob(job: Pick<ImageJob, 'id' | 'kind' | 'mode'>, event: string, data: Record<string, unknown> = {}) {
  console.info(imageLogPrefix, {
    jobId: job.id,
    kind: job.kind,
    mode: job.mode,
    event,
    ...data
  })
}

function toSafeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseJson<T>(text: string) {
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function toErrorMessage(text: string, status: number, statusText: string) {
  if (status === 524) return 'API 图片生成超时，建议降低分辨率或稍后重试'

  const parsed = parseJson<ImageGenerationResponse>(text)
  if (parsed) {
    return normalizeErrorMessage(parsed.error?.message || parsed.message || `API 请求失败: ${status} ${statusText || 'error'}`)
  }

  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return status >= 500 ? 'API 服务暂时不可用，请稍后重试' : `API 请求失败: ${status} ${statusText || 'error'}`
  }

  return normalizeErrorMessage(trimmed.slice(0, 500))
}

function normalizeErrorMessage(message: string) {
  const text = message.trim()
  const lower = text.toLowerCase()

  if (!text) return '图片生成失败，请稍后重试'
  if (lower.includes('cloudflare') || lower.includes('bad gateway') || lower.includes('cf_chl')) {
    return 'API 服务暂时不可用，请稍后重试'
  }
  if (lower.includes('internal_error') || lower.includes('received from peer') || lower.includes('stream error')) {
    return '图片生成连接中断，请重试'
  }
  if (lower.includes('did not return image data') || lower.includes('no output data')) {
    return 'API 未返回图片数据，请重试或调整提示词'
  }
  if (lower.includes('fetch failed') || lower.includes('econnreset') || lower.includes('etimedout')) {
    return '图片请求网络异常，请稍后重试'
  }

  return text
}

function isStreamDisconnectMessage(message: string) {
  const lower = message.toLowerCase()
  return lower.includes('stream disconnected')
    || lower.includes('before image generation completed')
    || lower.includes('stream error')
    || lower.includes('internal_error')
    || lower.includes('received from peer')
    || lower.includes('fetch failed')
    || lower.includes('econnreset')
    || lower.includes('etimedout')
    || lower.includes('premature')
    || lower.includes('terminated')
    || lower.includes('socket')
    || lower.includes('connection')
    || lower.includes('aborted')
    || lower.includes('closed')
    || lower.includes('body')
    || lower.includes('图片流未返回最终图片')
}

function shouldRetryStreaming(error: unknown) {
  const requestError = error as RequestError
  if (!requestError.streamStarted) return false
  if (requestError.retryableStream === false) return false

  const message = error instanceof Error ? error.message : ''
  return requestError.retryableStream === true || isStreamDisconnectMessage(message)
}

function toRequestError(error: unknown) {
  if (error instanceof Error) {
    error.message = normalizeErrorMessage(error.message)
    return error
  }

  return new Error('图片生成失败，请稍后重试')
}

function isPathFallbackStatus(status: number) {
  return status === 404 || status === 405
}

function shouldFallbackToNonStreaming(error: unknown) {
  const requestError = error as RequestError
  if (requestError.streamStarted) return false

  const status = requestError.status
  if (status && ![400, 404, 405, 406, 415, 422].includes(status)) return false

  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('stream')
    || message.includes('event-stream')
    || message.includes('not supported')
    || message.includes('unsupported')
}

function extractStreamData(block: string) {
  return block
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
    .trim()
}

function toStreamImage(event: ImageStreamEvent): GeneratedImage | null {
  const image = event.data?.[0] || event
  if (!image.b64_json && !image.url) return null

  return {
    b64_json: image.b64_json,
    url: image.url,
    revised_prompt: image.revised_prompt
  }
}

function parseStreamEvent(data: string) {
  if (!data || data === '[DONE]') return null

  const event = parseJson<ImageStreamEvent>(data)
  if (!event) return null
  if (event.message || event.error?.message) {
    const message = event.error?.message || event.message || ''
    const error = new Error(message) as RequestError
    error.streamStarted = true
    error.retryableStream = isStreamDisconnectMessage(message)
    throw error
  }

  return event
}

async function readImageGenerationStream(response: Response, job: ImageJob, startedAt: number) {
  if (!response.body) {
    throw new Error('图片流没有返回响应体')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completedImage: GeneratedImage | null = null
  let eventCount = 0
  let chunkCount = 0
  let firstChunkMs: number | null = null
  let finalImageMs: number | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (value) {
      chunkCount++
      firstChunkMs ??= getElapsedMs(startedAt)
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        const event = parseStreamEvent(extractStreamData(block))
        if (!event) continue

        eventCount++
        const image = toStreamImage(event)
        if (image) {
          completedImage = image
          finalImageMs = getElapsedMs(startedAt)
          logImageJob(job, 'stream-final-image', { elapsedMs: finalImageMs, eventCount, chunkCount })
        }
      }
    }

    if (done) break
  }

  const tail = parseStreamEvent(extractStreamData(buffer))
  const tailImage = tail ? toStreamImage(tail) : null
  if (tail) eventCount++
  if (tailImage) {
    completedImage = tailImage
    finalImageMs = getElapsedMs(startedAt)
    logImageJob(job, 'stream-final-image-tail', { elapsedMs: finalImageMs, eventCount, chunkCount })
  }

  logImageJob(job, 'stream-done', {
    elapsedMs: getElapsedMs(startedAt),
    firstChunkMs,
    finalImageMs,
    eventCount,
    chunkCount,
    hasCompletedImage: Boolean(completedImage)
  })

  if (!completedImage) {
    throw new Error('图片流未返回最终图片')
  }

  return {
    data: [completedImage]
  } satisfies ImageGenerationResponse
}

async function callImageGeneration(job: ImageJob, stream: boolean, signal: AbortSignal) {
  const startedAt = performance.now()
  logImageJob(job, stream ? 'stream-request-start' : 'sync-request-start', {
    size: job.size,
    quality: job.quality,
    resolution: job.resolution,
    ratio: job.ratio
  })

  const requestBody = JSON.stringify({
    model: imageModel,
    prompt: buildImagePrompt(job.prompt, job.size, job.quality),
    size: job.size,
    quality: job.quality,
    response_format: 'b64_json',
    n: 1,
    stream,
    ...(stream && { partial_images: 1 })
  })
  const upstreamPaths = ['/images/generations', '/v1/images/generations']
  let response: Response | null = null

  for (const path of upstreamPaths) {
    const pathStartedAt = performance.now()
    response = await fetch(`${sub2apiBaseURL()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${job.apiKey}`,
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json'
      },
      body: requestBody,
      signal
    })

    logImageJob(job, stream ? 'stream-response-headers' : 'sync-response-headers', {
      path,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('Content-Type'),
      elapsedMs: getElapsedMs(pathStartedAt),
      totalElapsedMs: getElapsedMs(startedAt)
    })

    if (response.ok || !isPathFallbackStatus(response.status)) break
    await response.text().catch(() => '')
  }

  if (!response) {
    throw new Error('Image API did not return response')
  }

  if (!response.ok) {
    const text = await response.text()
    logImageJob(job, stream ? 'stream-response-error' : 'sync-response-error', {
      status: response.status,
      elapsedMs: getElapsedMs(startedAt),
      bodyLength: text.length
    })
    const error = new Error(toErrorMessage(text, response.status, response.statusText)) as RequestError
    error.status = response.status
    throw error
  }

  if (stream && response.headers.get('Content-Type')?.includes('text/event-stream')) {
    try {
      return await readImageGenerationStream(response, job, startedAt)
    } catch (error) {
      const requestError = error as RequestError
      requestError.streamStarted = true
      requestError.retryableStream ??= error instanceof Error && isStreamDisconnectMessage(error.message)
      logImageJob(job, 'stream-read-error', {
        elapsedMs: getElapsedMs(startedAt),
        error: toSafeError(error)
      })
      throw error
    }
  }

  const text = await response.text()
  logImageJob(job, stream ? 'stream-json-body-read' : 'sync-json-body-read', {
    elapsedMs: getElapsedMs(startedAt),
    bodyLength: text.length
  })

  const result = parseJson<ImageGenerationResponse>(text) || {}
  const image = result.data?.[0]
  if (!image?.b64_json && !image?.url) {
    throw new Error('Image API did not return image data')
  }

  logImageJob(job, stream ? 'stream-request-complete' : 'sync-request-complete', {
    elapsedMs: getElapsedMs(startedAt),
    hasImage: true
  })

  return {
    data: result.data
  } satisfies ImageGenerationResponse
}

async function requestImageGeneration(job: ImageJob, signal: AbortSignal) {
  job.mode = undefined
  job.streamAttempts = 1
  job.mode = 'stream'

  try {
    return await callImageGeneration(job, true, signal)
  } catch (error) {
    logImageJob(job, 'stream-request-failed', { error: toSafeError(error) })
    if (signal.aborted) {
      throw error
    }

    const fallbackToSync = shouldFallbackToNonStreaming(error) || shouldRetryStreaming(error)
    logImageJob(job, 'stream-fallback-check', { fallbackToSync })
    if (!fallbackToSync) {
      throw error
    }

    job.mode = 'sync'
    logImageJob(job, 'sync-fallback-start')
    return callImageGeneration(job, false, signal)
  }
}

async function callImageEdit(job: ImageJob, signal: AbortSignal) {
  const startedAt = performance.now()
  job.mode = 'sync'
  job.streamAttempts = 0

  logImageJob(job, 'edit-request-start', {
    imageCount: job.images?.length || 0,
    size: job.size,
    quality: job.quality,
    resolution: job.resolution,
    ratio: job.ratio
  })

  if (!job.images?.length) {
    throw new Error('Image file is required')
  }

  const upstreamForm = new FormData()
  upstreamForm.set('model', imageModel)
  upstreamForm.set('prompt', buildImagePrompt(job.prompt, job.size, job.quality))
  upstreamForm.set('size', job.size)
  upstreamForm.set('quality', job.quality)
  upstreamForm.set('response_format', 'b64_json')
  upstreamForm.set('n', '1')
  job.images.forEach((image) => {
    upstreamForm.append('image', image)
  })

  const upstreamPaths = ['/images/edits', '/v1/images/edits']
  let response: Response | null = null

  for (const path of upstreamPaths) {
    const pathStartedAt = performance.now()
    response = await fetch(`${sub2apiBaseURL()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${job.apiKey}`
      },
      body: upstreamForm,
      signal
    })

    logImageJob(job, 'edit-response-headers', {
      path,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('Content-Type'),
      elapsedMs: getElapsedMs(pathStartedAt),
      totalElapsedMs: getElapsedMs(startedAt)
    })

    if (response.ok || !isPathFallbackStatus(response.status)) break
    await response.text().catch(() => '')
  }

  if (!response) {
    throw new Error('Image edit API did not return response')
  }

  const text = await response.text()
  logImageJob(job, 'edit-json-body-read', {
    elapsedMs: getElapsedMs(startedAt),
    bodyLength: text.length
  })

  if (!response.ok) {
    const error = new Error(toErrorMessage(text, response.status, response.statusText)) as RequestError
    error.status = response.status
    throw error
  }

  const result = parseJson<ImageGenerationResponse>(text) || {}
  const image = result.data?.[0]
  if (!image?.b64_json && !image?.url) {
    throw new Error('Image API did not return image data')
  }

  logImageJob(job, 'edit-request-complete', {
    elapsedMs: getElapsedMs(startedAt),
    hasImage: true
  })

  return {
    data: result.data
  } satisfies ImageGenerationResponse
}

async function requestImageJob(job: ImageJob, signal: AbortSignal) {
  if (job.kind === 'edit') return callImageEdit(job, signal)

  return requestImageGeneration(job, signal)
}

export function cleanupImageJobs() {
  const now = Date.now()
  for (const [id, job] of imageJobs) {
    if (now - new Date(job.createdAt).getTime() > maxJobAgeMs) {
      imageJobs.delete(id)
    }
  }
}

export function createImageJob(input: ImageJobInput) {
  cleanupImageJobs()

  const job: ImageJob = {
    ...input,
    id: randomUUID(),
    kind: 'generation',
    status: 'queued',
    createdAt: new Date().toISOString()
  }
  imageJobs.set(job.id, job)

  logImageJob(job, 'job-created', {
    size: job.size,
    quality: job.quality,
    resolution: job.resolution,
    ratio: job.ratio
  })

  void runImageJob(job.id)
  return job
}

export function createImageEditJob(input: ImageEditJobInput) {
  cleanupImageJobs()

  const job: ImageJob = {
    ...input,
    id: randomUUID(),
    kind: 'edit',
    status: 'queued',
    createdAt: new Date().toISOString()
  }
  imageJobs.set(job.id, job)

  logImageJob(job, 'job-created', {
    imageCount: job.images.length,
    size: job.size,
    quality: job.quality,
    resolution: job.resolution,
    ratio: job.ratio
  })

  void runImageJob(job.id)
  return job
}

export function getImageJob(id: string) {
  cleanupImageJobs()
  return imageJobs.get(id) || null
}

export async function runImageJob(id: string) {
  const job = imageJobs.get(id)
  if (!job || job.status !== 'queued') return

  const startedAt = performance.now()
  job.status = 'running'
  job.startedAt = new Date().toISOString()
  logImageJob(job, 'job-started')

  try {
    const timeoutMessage = job.kind === 'edit'
      ? 'API 图片编辑超时，建议降低分辨率或稍后重试'
      : 'API 图片生成超时，建议降低分辨率或稍后重试'
    const result = await withImageRequestTimeout(
      signal => requestImageJob(job, signal),
      timeoutMessage
    )
    const image = result.data?.[0]
    if (!image?.b64_json && !image?.url) {
      throw new Error('图片接口未返回图片数据')
    }

    job.status = 'completed'
    job.completedAt = new Date().toISOString()
    job.data = result.data
    job.images = undefined
    logImageJob(job, 'job-completed', {
      elapsedMs: getElapsedMs(startedAt),
      completedAt: job.completedAt
    })
  } catch (error) {
    const requestError = toRequestError(error) as RequestError
    job.status = 'error'
    job.completedAt = new Date().toISOString()
    job.errorStatus = requestError.status
    job.images = undefined
    job.error = requestError.message
    logImageJob(job, 'job-error', {
      elapsedMs: getElapsedMs(startedAt),
      errorStatus: job.errorStatus,
      error: job.error
    })
  }
}
