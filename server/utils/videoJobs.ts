import { randomUUID } from 'node:crypto'
import { sub2apiBaseURL } from './sub2api'
import { withImageRequestTimeout } from './imageUpstreamRequest'
import { createJobStore, getElapsedMs, parseJson, toSafeError, type BaseJob } from './mediaJobStore'
import type { RequestError } from '../../shared/utils/errors'

export interface VideoJobInput {
  apiKey: string
  model: string
  prompt: string
  /** 秒，1-15 */
  duration: number
  /** 480p / 720p（不传时上游默认 480p） */
  resolution?: string
  /** 图生视频源图（base64，不含 data: 前缀） */
  image?: {
    data: string
    mediaType: string
  }
}

export interface GeneratedVideo {
  url?: string
  revised_prompt?: string
}

export interface VideoJob extends VideoJobInput, BaseJob {
  requestId?: string
  data?: GeneratedVideo[]
  /** 上游返回的本次实际扣费（美元） */
  costUsd?: number
  /** 上游返回相对路径时的原始 content 路径（需带 API key 访问，走本服务代理） */
  contentPath?: string
}

// 视频生成常超 10 分钟：超时/TTL/轮询参数独立于图片管线
const videoJobTimeoutMs = 1000 * 60 * 20
const videoJobMaxAgeMs = 1000 * 60 * 60 * 2
const videoPollIntervalMs = 5000
const videoPollRequestTimeoutMs = 30_000
const videoLogPrefix = '[video-job]'

const store = createJobStore<VideoJob>(videoJobMaxAgeMs)

function logVideoJob(job: Pick<VideoJob, 'id' | 'model'>, event: string, data: Record<string, unknown> = {}) {
  console.info(videoLogPrefix, {
    jobId: job.id,
    model: job.model,
    event,
    ...data
  })
}

function normalizeVideoErrorMessage(message: string) {
  const text = message.trim()
  const lower = text.toLowerCase()

  if (!text) return '视频生成失败，请稍后重试'
  if (lower.includes('cloudflare') || lower.includes('bad gateway') || lower.includes('cf_chl')) {
    return 'API 服务暂时不可用，请稍后重试'
  }
  if (lower.includes('timeout') || lower.includes('超时') || lower.includes('timed out')) {
    return '视频生成超时，请缩短时长或稍后重试'
  }
  if (lower.includes('fetch failed') || lower.includes('econnreset') || lower.includes('etimedout') || lower.includes('socket')) {
    return '视频请求网络异常，请稍后重试'
  }
  if (lower.includes('content') && (lower.includes('policy') || lower.includes('moderation') || lower.includes('flagged'))) {
    return '提示词或源图未通过内容审核，请调整后重试'
  }

  return text
}

function toVideoRequestError(error: unknown) {
  if (error instanceof Error) {
    error.message = normalizeVideoErrorMessage(error.message)
    return error
  }

  return new Error('视频生成失败，请稍后重试')
}

function toVideoErrorMessage(text: string, status: number, statusText: string) {
  if (status === 524) return '视频生成超时，请缩短时长或稍后重试'

  const parsed = parseJson<{ error?: { message?: string }, message?: string }>(text)
  if (parsed) {
    return normalizeVideoErrorMessage(parsed.error?.message || parsed.message || `API 请求失败: ${status} ${statusText || 'error'}`)
  }

  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return status >= 500 ? 'API 服务暂时不可用，请稍后重试' : `API 请求失败: ${status} ${statusText || 'error'}`
  }

  return normalizeVideoErrorMessage(trimmed.slice(0, 500))
}

function isPathFallbackStatus(status: number) {
  return status === 404 || status === 405
}

function extractVideoResult(payload: Record<string, any> | null | undefined): GeneratedVideo | null {
  if (!payload) return null

  const candidates: Array<Record<string, any> | undefined> = [
    payload.data?.[0],
    payload.video,
    payload.output?.[0],
    payload
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const url = typeof candidate.url === 'string' && candidate.url
      ? candidate.url
      : typeof candidate.video_url === 'string' && candidate.video_url
        ? candidate.video_url
        : undefined
    if (url) {
      return {
        url,
        revised_prompt: typeof candidate.revised_prompt === 'string' ? candidate.revised_prompt : undefined
      }
    }
  }

  return null
}

function extractRequestId(payload: Record<string, any> | null | undefined) {
  if (!payload) return undefined

  const candidates = [payload.request_id, payload.task_id, payload.id, payload.data?.request_id, payload.data?.task_id]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return undefined
}

function extractCostTicks(payload: Record<string, any> | null | undefined) {
  const ticks = payload?.usage?.cost_in_usd_ticks
  return typeof ticks === 'number' && ticks > 0 ? ticks : undefined
}

type VideoPollState = { state: 'pending' } | { state: 'done', video: GeneratedVideo, costTicks?: number } | { state: 'error', message: string }

function parseVideoStatusResponse(payload: Record<string, any> | null): VideoPollState {
  const video = extractVideoResult(payload)
  if (video) return { state: 'done', video, costTicks: extractCostTicks(payload) }

  const rawStatus = payload?.status ?? payload?.state
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : ''

  if (['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(status)) {
    const message = payload?.error?.message || payload?.message || `视频生成失败（${status}）`
    return { state: 'error', message }
  }

  if (['done', 'completed', 'succeeded', 'success', 'finished'].includes(status)) {
    // 声称完成却没有可用 URL
    return { state: 'error', message: '视频接口未返回视频地址，请重试' }
  }

  return { state: 'pending' }
}

async function fetchUpstream(job: VideoJob, paths: string[], init: RequestInit, signal: AbortSignal, logEvent: string) {
  let response: Response | null = null

  for (const path of paths) {
    const pathStartedAt = performance.now()
    response = await fetch(`${sub2apiBaseURL()}${path}`, { ...init, signal })

    logVideoJob(job, logEvent, {
      path,
      status: response.status,
      ok: response.ok,
      elapsedMs: getElapsedMs(pathStartedAt)
    })

    if (response.ok || !isPathFallbackStatus(response.status)) break
    await response.text().catch(() => '')
  }

  if (!response) {
    throw new Error('视频接口没有返回响应')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error = new Error(toVideoErrorMessage(text, response.status, response.statusText)) as RequestError
    error.status = response.status
    throw error
  }

  return response
}

async function submitVideoGeneration(job: VideoJob, signal: AbortSignal) {
  // 图生视频源图字段名为 image_url（用 `image` 会被 xAI 上游 422 拒绝，实测确认）
  const body = JSON.stringify({
    model: job.model,
    prompt: job.prompt,
    duration: job.duration,
    ...(job.resolution && { resolution: job.resolution }),
    ...(job.image && { image_url: `data:${job.image.mediaType};base64,${job.image.data}` })
  })

  const response = await fetchUpstream(
    job,
    ['/videos/generations', '/v1/videos/generations'],
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${job.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body
    },
    signal,
    'submit-response'
  )

  const payload = parseJson<Record<string, any>>(await response.text())

  // 兼容两种上游形态：直接返回视频 URL，或返回 request_id 走异步轮询
  const video = extractVideoResult(payload)
  if (video) return { video, costTicks: extractCostTicks(payload) }

  const requestId = extractRequestId(payload)
  if (!requestId) {
    throw new Error('视频接口未返回任务 ID，请重试')
  }

  return { requestId }
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function pollVideoResult(job: VideoJob, requestId: string, signal: AbortSignal) {
  const paths = [`/videos/${requestId}`, `/v1/videos/${requestId}`]
  let pollCount = 0

  while (true) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const response = await fetchUpstream(
      job,
      paths,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${job.apiKey}`,
          Accept: 'application/json'
        }
      },
      AbortSignal.any([signal, AbortSignal.timeout(videoPollRequestTimeoutMs)]),
      'poll-response'
    )

    pollCount++
    const payload = parseJson<Record<string, any>>(await response.text())
    const result = parseVideoStatusResponse(payload)

    if (result.state === 'done') {
      logVideoJob(job, 'poll-done', { pollCount })
      if (result.costTicks) {
        // Sub2API 计费单位：1e10 ticks = 1 USD（实测）
        job.costUsd = result.costTicks / 1e10
      }
      return result.video
    }
    if (result.state === 'error') {
      throw new Error(result.message)
    }

    await abortableDelay(videoPollIntervalMs, signal)
  }
}

export function createVideoJob(input: VideoJobInput) {
  const job: VideoJob = {
    ...input,
    id: randomUUID(),
    status: 'queued',
    createdAt: new Date().toISOString()
  }
  store.set(job)

  logVideoJob(job, 'job-created', {
    duration: job.duration,
    hasImage: Boolean(job.image)
  })

  void runVideoJob(job.id)
  return job
}

export function getVideoJob(id: string) {
  return store.get(id)
}

export async function runVideoJob(id: string) {
  const job = store.jobs.get(id)
  if (!job || job.status !== 'queued') return

  const startedAt = performance.now()
  job.status = 'running'
  job.startedAt = new Date().toISOString()
  logVideoJob(job, 'job-started')

  try {
    let result = await withImageRequestTimeout(
      async (signal) => {
        const submitted = await submitVideoGeneration(job, signal)
        if (submitted.video) {
          if (submitted.costTicks) {
            job.costUsd = submitted.costTicks / 1e10
          }
          return submitted.video
        }

        job.requestId = submitted.requestId
        logVideoJob(job, 'poll-start', { requestId: submitted.requestId })
        return pollVideoResult(job, submitted.requestId!, signal)
      },
      '视频生成超时，请缩短时长或稍后重试',
      videoJobTimeoutMs
    )

    if (!result?.url) {
      throw new Error('视频接口未返回视频地址，请重试')
    }

    // 上游（Sub2API Grok）返回的常是需带 key 访问的相对路径（/v1/videos/{id}/content），
    // 重写为本服务的内容代理地址，浏览器可直接播放/下载。
    if (result.url.startsWith('/')) {
      job.contentPath = result.url
      result = { ...result, url: `/api/videos/content/${job.id}` }
    }

    job.status = 'completed'
    job.completedAt = new Date().toISOString()
    job.data = [result]
    job.image = undefined
    logVideoJob(job, 'job-completed', { elapsedMs: getElapsedMs(startedAt), proxied: Boolean(job.contentPath) })
  } catch (error) {
    const requestError = toVideoRequestError(error) as RequestError
    job.status = 'error'
    job.completedAt = new Date().toISOString()
    job.errorStatus = requestError.status
    job.error = requestError.message
    job.image = undefined
    logVideoJob(job, 'job-error', {
      elapsedMs: getElapsedMs(startedAt),
      errorStatus: job.errorStatus,
      error: toSafeError(error)
    })
  }
}
