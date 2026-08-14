import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { sub2apiBaseURL, sub2apiRootURL } from './sub2api'
import { withImageRequestTimeout } from './imageUpstreamRequest'
import { downloadImageAsBase64 } from './safeImageDownload'
import {
  AsyncImageUnsupportedError,
  asyncImageMaxWaitMs,
  isGeminiAsyncFallbackError,
  pollAsyncImageResult,
  resolveAsyncPollUrl,
  submitAsyncImageGeneration
} from './imageAsyncUpstream'
import { buildGeminiImageBody, callGeminiImageGeneration, type GeminiReferenceImage } from './imageGeminiUpstream'
import { buildImagePrompt, type ImageQuality, type ImageRatio, type ImageResolution } from '../../shared/utils/images'
import { defaultImageModelId, resolveMediaModelSpec } from '../../shared/utils/mediaModels'
import { createJobStore, getElapsedMs, parseJson, toSafeError } from './mediaJobStore'
import { recordMediaError } from './mediaErrorLog'
import { recordMediaHistory } from './mediaHistory'
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
  mode?: 'stream' | 'sync' | 'async'
  streamAttempts?: number
  /** 异步模式:网关任务 id(排障用;进程内存存储,重启即失,同 mediaJobStore 取舍) */
  upstreamTaskId?: string
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
// grok 系走 aspect_ratio 参数（见 jobAspectRatio），提示词保持原样。
function buildJobPrompt(job: ImageJob) {
  if (supportsSizeQuality(job)) {
    return buildImagePrompt(job.prompt, job.size, job.quality)
  }
  return job.prompt
}

// grok 上游的 aspect_ratio 是有限集合，越界值会被 422，越界/Auto 时不带参数
function jobAspectRatio(job: ImageJob) {
  if (supportsSizeQuality(job)) return undefined
  if (!job.ratio || job.ratio === 'Auto') return undefined

  const allowed = resolveMediaModelSpec(jobModel(job)).supportedAspectRatios
  if (allowed && !allowed.includes(job.ratio)) return undefined
  return job.ratio
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

  const aspectRatio = jobAspectRatio(job)
  const requestBody = JSON.stringify({
    model: jobModel(job),
    prompt: buildJobPrompt(job),
    ...(supportsSizeQuality(job) && { size: job.size, quality: job.quality }),
    ...(aspectRatio && { aspect_ratio: aspectRatio }),
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
    // body 只能读一次;保留第一次的错误文本——备用路径的裸 404(如 "404 page not found")
    // 不如首个响应有信息量(例如网关的 "Images API is not supported for this platform")
    const attemptText = await response.text().catch(() => '')
    if (!errorText) errorText = attemptText
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

// ==================== 异步生图(网关 /images/generations/async) ====================
// feature flag:SUB2API_ASYNC_IMAGES=1 开启;开启后仍带能力探测——提交遇 404/405
// 记忆性降级(10 分钟内不再尝试),回落到原同步/流式路径,兼容未升级的网关。
const asyncUnsupportedTtlMs = 10 * 60 * 1000
let asyncUnsupportedUntil = 0

export function isAsyncImagesEnabled() {
  const flag = (process.env.SUB2API_ASYNC_IMAGES || '').toLowerCase()
  return flag === '1' || flag === 'true'
}

const geminiAsyncUnsupportedTtlMs = 10 * 60 * 1000
let geminiAsyncUnsupportedUntil = 0

export function isAsyncImageEligible(kind: ImageJobKind, model?: string) {
  if (kind !== 'generation' || !isAsyncImagesEnabled()) return false
  // gemini 用独立的降级记忆:老网关不支持时只降 gemini,不连累 grok/openai
  if (model && resolveMediaModelSpec(model).provider === 'google') {
    return Date.now() >= geminiAsyncUnsupportedUntil
  }
  return Date.now() >= asyncUnsupportedUntil
}

// 老网关对 gemini 的失败形态:提交 404/405,或任务执行失败带平台不支持信息
async function callImageGenerationAsync(job: ImageJob, signal: AbortSignal) {
  const startedAt = performance.now()
  job.mode = 'async'
  job.streamAttempts = 0

  const aspectRatio = jobAspectRatio(job)
  // 请求体与同步接口一致(去掉流式相关字段)
  const requestBody = JSON.stringify({
    model: jobModel(job),
    prompt: buildJobPrompt(job),
    ...(supportsSizeQuality(job) && { size: job.size, quality: job.quality }),
    ...(aspectRatio && { aspect_ratio: aspectRatio }),
    response_format: 'b64_json',
    n: 1
  })

  logImageJob(job, 'async-submit-start', {
    size: job.size,
    quality: job.quality,
    resolution: job.resolution,
    ratio: job.ratio
  })

  const submitted = await submitAsyncImageGeneration({
    baseUrl: sub2apiBaseURL(),
    apiKey: job.apiKey,
    body: requestBody,
    signal
  })
  job.upstreamTaskId = submitted.taskId
  const pollUrl = resolveAsyncPollUrl(submitted.pollUrl, sub2apiRootURL())
  logImageJob(job, 'async-submitted', {
    taskId: submitted.taskId,
    retryAfterMs: submitted.retryAfterMs,
    elapsedMs: getElapsedMs(startedAt)
  })

  const outcome = await pollAsyncImageResult({
    pollUrl,
    apiKey: job.apiKey,
    initialIntervalMs: submitted.retryAfterMs,
    signal,
    onTick: ({ elapsedMs, status }) => {
      // 每 30s 记录一次心跳,避免日志刷屏
      if (elapsedMs % 30_000 < submitted.retryAfterMs) {
        logImageJob(job, 'async-polling', { elapsedMs, status })
      }
    }
  })

  logImageJob(job, 'async-completed', {
    elapsedMs: getElapsedMs(startedAt),
    imageCount: outcome.data.length
  })

  return {
    data: outcome.data.map(item => ({ url: item.url, revised_prompt: item.revised_prompt })),
    usage: outcome.usage
  } satisfies ImageGenerationResponse
}


// ==================== Gemini(Nano Banana):v1beta generateContent ====================
// 网关不给 gemini 开 /v1/images 端点;图片按图计费(单价×尺寸倍率×分组倍率),
// imageSize 必须显式传(不传网关默认按 2K 计 ×1.5)。参考图以 inlineData 随 parts 提交。
async function requestGeminiImageJob(job: ImageJob, signal: AbortSignal) {
  // 网关 0faf5caf9 起 gemini 支持异步 images 管线(S3 转存+预签名)——优先走它;
  // 老网关不支持时记忆性降级(仅 gemini),回落 v1beta 原生路径(内联 b64)
  if (isAsyncImageEligible(job.kind, jobModel(job))) {
    try {
      return await callImageGenerationAsync(job, signal)
    } catch (error) {
      if (!isGeminiAsyncFallbackError(error)) throw error
      geminiAsyncUnsupportedUntil = Date.now() + geminiAsyncUnsupportedTtlMs
      logImageJob(job, 'gemini-async-fallback', { error: toSafeError(error) })
    }
  }

  const startedAt = performance.now()
  job.mode = 'sync'
  job.streamAttempts = 0

  const spec = resolveMediaModelSpec(jobModel(job))
  const allowed = spec.supportedAspectRatios
  const aspectRatio = job.ratio && job.ratio !== 'Auto' && (!allowed || allowed.includes(job.ratio))
    ? job.ratio
    : undefined

  const referenceImages: GeminiReferenceImage[] = []
  for (const file of job.images || []) {
    const buffer = Buffer.from(await file.arrayBuffer())
    referenceImages.push({
      mimeType: file.type?.split(';')[0] || 'image/png',
      data: buffer.toString('base64')
    })
  }

  logImageJob(job, 'gemini-request-start', {
    imageSize: job.resolution,
    aspectRatio,
    referenceCount: referenceImages.length
  })

  const images = await callGeminiImageGeneration({
    rootUrl: sub2apiRootURL(),
    apiKey: job.apiKey,
    model: jobModel(job),
    body: buildGeminiImageBody({
      prompt: job.prompt,
      imageSize: job.resolution,
      aspectRatio,
      referenceImages
    }),
    signal
  })

  logImageJob(job, 'gemini-request-complete', {
    elapsedMs: getElapsedMs(startedAt),
    imageCount: images.length
  })

  return {
    data: images.map(image => ({ b64_json: image.b64, mime_type: image.mimeType }))
  } satisfies ImageGenerationResponse
}

async function requestImageGeneration(job: ImageJob, signal: AbortSignal) {
  if (isAsyncImageEligible(job.kind, jobModel(job))) {
    try {
      return await callImageGenerationAsync(job, signal)
    } catch (error) {
      if (error instanceof AsyncImageUnsupportedError) {
        asyncUnsupportedUntil = Date.now() + asyncUnsupportedTtlMs
        logImageJob(job, 'async-unsupported-fallback', { error: error.message })
        // 落回原路径继续(提交未成功,不存在双扣费)
      } else {
        throw error
      }
    }
  }

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
  const editAspectRatio = jobAspectRatio(job)
  if (editAspectRatio) {
    upstreamForm.set('aspect_ratio', editAspectRatio)
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
    // body 只能读一次;保留第一次的错误文本——备用路径的裸 404(如 "404 page not found")
    // 不如首个响应有信息量(例如网关的 "Images API is not supported for this platform")
    const attemptText = await response.text().catch(() => '')
    if (!errorText) errorText = attemptText
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
  if (resolveMediaModelSpec(jobModel(job)).provider === 'google') {
    return requestGeminiImageJob(job, signal)
  }
  if (job.kind === 'edit') return requestImageEditJob(job, signal)

  return requestImageGeneration(job, signal)
}

// 上游返回的是临时直链(xAI 直链/S3 预签名,会过期),服务端拉下来转成 base64,
// 让前端与其他图片一致地走 IndexedDB 本地持久化。下载经 safeImageDownload 加固
// (https-only、私网 IP/重定向复验、流式大小上限、魔数校验)。
// strict=false(同步/流式路径,存量行为):失败保留原始 URL,前端仍可短期展示;
// strict=true(异步路径):S3 预签名只有时效,绝不能把它当成永久地址写进历史——
// 带重试下载,最终失败让任务报错。
async function materializeRemoteImages(
  job: ImageJob,
  result: ImageGenerationResponse,
  signal: AbortSignal,
  strict = false
) {
  for (const image of result.data || []) {
    if (image.b64_json || !image.url || !/^https?:\/\//.test(image.url)) continue

    const attempts = strict ? 3 : 1
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const downloaded = await downloadImageAsBase64(image.url, { signal })
        image.b64_json = downloaded.base64
        image.mime_type = downloaded.mimeType
        image.url = undefined
        logImageJob(job, 'remote-image-materialized', { bytes: downloaded.bytes, attempt, strict })
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        logImageJob(job, 'remote-image-materialize-failed', { attempt, strict, error: toSafeError(error) })
        if (signal.aborted || attempt === attempts) break
        await new Promise(resolve => setTimeout(resolve, attempt * 1500))
      }
    }

    if (strict && lastError) {
      // 保留 URL 会让 168h 预签名地址被前端持久化,宁可报错让用户重试
      throw new Error('图片已生成但服务端下载失败,请重试')
    }
  }
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
    // 异步任务上游允许跑满 30 分钟,总预算另加下载/回退余量;原路径维持 10 分钟
    const asyncEligible = isAsyncImageEligible(job.kind, jobModel(job))
    const timeoutMs = asyncEligible ? asyncImageMaxWaitMs + 2 * 60 * 1000 : undefined
    // 账号历史只存 URL(S3 预签名);materialize 会把 url 置空,先捕获
    let historyUrls: string[] = []
    const result = await withImageRequestTimeout(
      async (signal) => {
        const response = await requestImageJob(job, signal)
        if (job.mode === 'async') {
          historyUrls = (response.data || [])
            .map(image => image.url)
            .filter((url): url is string => Boolean(url && /^https?:\/\//.test(url)))
        }
        await materializeRemoteImages(job, response, signal, job.mode === 'async')
        return response
      },
      timeoutMessage,
      timeoutMs
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

    // 账号级历史(尽力而为,不影响任务):异步模式才有可留存的 URL
    for (const url of historyUrls) {
      void recordMediaHistory({
        apiKey: job.apiKey,
        kind: 'image',
        model: jobModel(job),
        prompt: job.prompt,
        imageUrl: url,
        completedAtMs: Date.now(),
        costUsd: job.costUsd
      })
    }
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
    recordMediaError({
      kind: 'image',
      jobId: job.id,
      model: jobModel(job),
      status: job.errorStatus,
      error: job.error || '未知错误',
      promptExcerpt: job.prompt.slice(0, 120),
      extra: { taskKind: job.kind, ratio: job.ratio, resolution: job.resolution }
    })
  }
}
