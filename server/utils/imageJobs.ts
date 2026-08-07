import { randomUUID } from 'node:crypto'
import { sub2apiBaseURL } from './sub2api'
import { withImageRequestTimeout } from './imageUpstreamRequest'
import { buildImagePrompt, type ImageQuality, type ImageRatio, type ImageResolution } from '../../shared/utils/images'
import { defaultImageModelId, resolveMediaModelSpec } from '../../shared/utils/mediaModels'
import { createJobStore, getElapsedMs, parseJson, toSafeError } from './mediaJobStore'
import type { RequestError } from '../../shared/utils/errors'

type ImageJobStatus = 'queued' | 'running' | 'completed' | 'error'
type ImageJobKind = 'generation' | 'edit'

interface GeneratedImage {
  b64_json?: string
  url?: string
  revised_prompt?: string
  mime_type?: string
}

interface MediaUsage {
  cost_in_usd_ticks?: number
}

interface ImageGenerationResponse {
  data?: GeneratedImage[]
  usage?: MediaUsage
  error?: {
    message?: string
  }
  message?: string
}

interface ImageStreamEvent extends GeneratedImage {
  type?: string
  message?: string
  error?: {
    message?: string
  }
  data?: GeneratedImage[]
  usage?: MediaUsage
}

export interface ImageJobInput {
  apiKey: string
  prompt: string
  model?: string
  ratio: ImageRatio
  resolution: ImageResolution
  size: string
  quality: ImageQuality
  stream?: boolean
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
  /** 上游返回的本次实际扣费（美元） */
  costUsd?: number
  mode?: 'stream' | 'sync'
  streamAttempts?: number
}

const maxJobAgeMs = 1000 * 60 * 60
const store = createJobStore<ImageJob>(maxJobAgeMs)
const imageLogPrefix = '[image-job]'

function logImageJob(job: Pick<ImageJob, 'id' | 'kind' | 'mode'>, event: string, data: Record<string, unknown> = {}) {
  console.info(imageLogPrefix, {
    jobId: job.id,
    kind: job.kind,
    mode: job.mode,
    event,
    ...data
  })
}

function jobModel(job: ImageJob) {
  return job.model || defaultImageModelId
}

function supportsSizeQuality(job: ImageJob) {
  return resolveMediaModelSpec(jobModel(job)).supportsSizeQuality ?? false
}

// gpt-image 系通过 size/quality 参数 + 提示词注入控制画幅；
// 其他模型（grok-imagine 等）只吃纯提示词，画幅以文字提示尽力约束。
function buildJobPrompt(job: ImageJob) {
  if (supportsSizeQuality(job)) {
    return buildImagePrompt(job.prompt, job.size, job.quality)
  }
  if (job.ratio && job.ratio !== 'Auto') {
    return `${job.prompt}\n\nAspect ratio: ${job.ratio}.`
  }
  return job.prompt
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

function isRecoverableImageError(error: unknown) {
  const requestError = error as RequestError
  const status = requestError.status
  if (status) return [408, 500, 502, 503, 504, 524].includes(status)

  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('timeout')
    || message.includes('超时')
    || message.includes('temporarily unavailable')
    || message.includes('暂时不可用')
    || message.includes('upstream request failed')
    || message.includes('did not return image data')
    || message.includes('no output data')
    || message.includes('未返回图片数据')
    || isStreamDisconnectMessage(message)
}

function shouldFallbackFromStreamToSync(error: unknown) {
  return isRecoverableImageError(error)
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
  if (event.type?.includes('partial_image')) return null

  const image = event.data?.[0] || event
  if (!image.b64_json && !image.url) return null

  return {
    b64_json: image.b64_json,
    url: image.url,
    revised_prompt: image.revised_prompt,
    mime_type: image.mime_type
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
  let usage: MediaUsage | undefined
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
        if (event.usage) usage = event.usage
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
  if (tail?.usage) usage = tail.usage
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
    data: [completedImage],
    usage
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
    model: jobModel(job),
    prompt: buildJobPrompt(job),
    ...(supportsSizeQuality(job) && { size: job.size, quality: job.quality }),
    response_format: 'b64_json',
    n: 1,
    stream,
    ...(stream && { partial_images: 1 })
  })
  const upstreamPaths = ['/images/generations', '/v1/images/generations']
  let response: Response | null = null
  let errorText = ''

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

    if (response.ok) break
    // body 只能读一次：非 ok 先把错误文本拿出来，路径回退时再覆盖
    errorText = await response.text().catch(() => '')
    if (!isPathFallbackStatus(response.status)) break
  }

  if (!response) {
    throw new Error('Image API did not return response')
  }

  if (!response.ok) {
    logImageJob(job, stream ? 'stream-response-error' : 'sync-response-error', {
      status: response.status,
      elapsedMs: getElapsedMs(startedAt),
      bodyLength: errorText.length
    })
    const error = new Error(toErrorMessage(errorText, response.status, response.statusText)) as RequestError
    error.status = response.status
    throw error
  }

  if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
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
    data: result.data,
    usage: result.usage
  } satisfies ImageGenerationResponse
}

async function requestImageGeneration(job: ImageJob, signal: AbortSignal) {
  if (typeof job.stream === 'boolean') {
    job.mode = job.stream ? 'stream' : 'sync'
    job.streamAttempts = job.stream ? 1 : 0
    return callImageGeneration(job, job.stream, signal)
  }

  job.mode = 'stream'
  job.streamAttempts = 1
  try {
    return await callImageGeneration(job, true, signal)
  } catch (error) {
    logImageJob(job, 'stream-request-failed', { error: toSafeError(error) })
    if (signal.aborted || !shouldFallbackFromStreamToSync(error)) {
      throw error
    }

    job.mode = 'sync'
    logImageJob(job, 'sync-fallback-start')
    return callImageGeneration(job, false, signal)
  }
}

async function callImageEdit(job: ImageJob, stream: boolean, signal: AbortSignal) {
  const startedAt = performance.now()
  job.mode = stream ? 'stream' : 'sync'
  job.streamAttempts = stream ? 1 : 0

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
  upstreamForm.set('model', jobModel(job))
  upstreamForm.set('prompt', buildJobPrompt(job))
  if (supportsSizeQuality(job)) {
    upstreamForm.set('size', job.size)
    upstreamForm.set('quality', job.quality)
  }
  upstreamForm.set('response_format', 'b64_json')
  upstreamForm.set('n', '1')
  upstreamForm.set('stream', String(stream))
  if (stream) {
    upstreamForm.set('partial_images', '1')
  }
  job.images.forEach((image) => {
    upstreamForm.append('image', image)
  })

  const upstreamPaths = ['/images/edits', '/v1/images/edits']
  let response: Response | null = null
  let errorText = ''

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

    if (response.ok) break
    // body 只能读一次：非 ok 先把错误文本拿出来，路径回退时再覆盖
    errorText = await response.text().catch(() => '')
    if (!isPathFallbackStatus(response.status)) break
  }

  if (!response) {
    throw new Error('Image edit API did not return response')
  }

  if (!response.ok) {
    const error = new Error(toErrorMessage(errorText, response.status, response.statusText)) as RequestError
    error.status = response.status
    throw error
  }

  if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
    try {
      return await readImageGenerationStream(response, job, startedAt)
    } catch (error) {
      const requestError = error as RequestError
      requestError.streamStarted = true
      requestError.retryableStream ??= error instanceof Error && isStreamDisconnectMessage(error.message)
      logImageJob(job, 'edit-stream-read-error', {
        elapsedMs: getElapsedMs(startedAt),
        error: toSafeError(error)
      })
      throw error
    }
  }

  const text = await response.text()
  logImageJob(job, 'edit-json-body-read', {
    elapsedMs: getElapsedMs(startedAt),
    bodyLength: text.length
  })

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
    data: result.data,
    usage: result.usage
  } satisfies ImageGenerationResponse
}

async function requestImageEditJob(job: ImageJob, signal: AbortSignal) {
  if (typeof job.stream === 'boolean') {
    return callImageEdit(job, job.stream, signal)
  }

  try {
    return await callImageEdit(job, true, signal)
  } catch (error) {
    logImageJob(job, 'edit-stream-request-failed', { error: toSafeError(error) })
    if (signal.aborted || !shouldFallbackFromStreamToSync(error)) {
      throw error
    }

    logImageJob(job, 'edit-sync-fallback-start')
    return callImageEdit(job, false, signal)
  }
}

async function requestImageJob(job: ImageJob, signal: AbortSignal) {
  if (job.kind === 'edit') return requestImageEditJob(job, signal)

  return requestImageGeneration(job, signal)
}

// 不支持流式的模型（grok-imagine 等）强制走同步请求，跳过 SSE 尝试与降级重试
function resolveStreamOption(input: ImageJobInput) {
  const supportsStream = resolveMediaModelSpec(input.model || defaultImageModelId).supportsStream ?? false
  return supportsStream ? input.stream : false
}

export function createImageJob(input: ImageJobInput) {
  const job: ImageJob = {
    ...input,
    stream: resolveStreamOption(input),
    id: randomUUID(),
    kind: 'generation',
    status: 'queued',
    createdAt: new Date().toISOString()
  }
  store.set(job)

  logImageJob(job, 'job-created', {
    model: jobModel(job),
    size: job.size,
    quality: job.quality,
    resolution: job.resolution,
    ratio: job.ratio
  })

  void runImageJob(job.id)
  return job
}

export function createImageEditJob(input: ImageEditJobInput) {
  const job: ImageJob = {
    ...input,
    stream: resolveStreamOption(input),
    id: randomUUID(),
    kind: 'edit',
    status: 'queued',
    createdAt: new Date().toISOString()
  }
  store.set(job)

  logImageJob(job, 'job-created', {
    model: jobModel(job),
    imageCount: input.images.length,
    size: job.size,
    quality: job.quality,
    resolution: job.resolution,
    ratio: job.ratio
  })

  void runImageJob(job.id)
  return job
}

export function getImageJob(id: string) {
  return store.get(id)
}

export async function runImageJob(id: string) {
  const job = store.jobs.get(id)
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

    const costTicks = result.usage?.cost_in_usd_ticks
    job.status = 'completed'
    job.completedAt = new Date().toISOString()
    job.data = result.data
    if (typeof costTicks === 'number' && costTicks > 0) {
      // Sub2API 计费单位：1e10 ticks = 1 USD（实测）
      job.costUsd = costTicks / 1e10
    }
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
