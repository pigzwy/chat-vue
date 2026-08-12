import type { RequestError } from '../../shared/utils/errors'

/**
 * Sub2API 异步生图接入(网关契约):
 * - 提交:POST {base}/images/generations/async(请求体同同步接口)→ 202
 *   {task_id,status:"processing",poll_url},Retry-After: 3
 * - 轮询:GET poll_url(必须携带提交时同一把 API Key)
 * - 完成:{status:"completed",image_url,result:{data:[{url}]}}(S3 预签名 URL,
 *   仅作临时下载源,由调用方立即服务端下载转 b64)
 * - 失败:{status:"failed",http_status,error};任务上限 30 分钟
 */

export const asyncImageMaxWaitMs = 30 * 60 * 1000
export const asyncImageDefaultPollMs = 3000

/** 提交阶段 404/405:网关未部署异步端点 → 调用方回退同步路径 */
export class AsyncImageUnsupportedError extends Error {
  constructor(status: number) {
    super(`异步生图端点不可用(HTTP ${status})`)
    this.name = 'AsyncImageUnsupportedError'
  }
}

export interface AsyncSubmitResult {
  taskId: string
  pollUrl: string
  retryAfterMs: number
}

interface AsyncTaskPayload {
  task_id?: string
  status?: string
  poll_url?: string
  image_url?: string
  http_status?: number
  error?: string | { message?: string }
  result?: {
    data?: Array<{ url?: string, revised_prompt?: string }>
    usage?: { cost_in_usd_ticks?: number }
  }
  usage?: { cost_in_usd_ticks?: number }
}

export interface AsyncPollOutcome {
  data: Array<{ url: string, revised_prompt?: string }>
  usage?: { cost_in_usd_ticks?: number }
}

function parsePayload(text: string): AsyncTaskPayload {
  try {
    return JSON.parse(text) as AsyncTaskPayload
  } catch {
    return {}
  }
}

function payloadErrorMessage(payload: AsyncTaskPayload, fallback: string) {
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim()
  if (payload.error && typeof payload.error === 'object' && payload.error.message) return payload.error.message
  return fallback
}

function retryAfterToMs(headerValue: string | null) {
  const seconds = Number(headerValue)
  if (!Number.isFinite(seconds) || seconds <= 0) return asyncImageDefaultPollMs
  // 轮询间隔限制在 1s~30s,防呆
  return Math.min(Math.max(seconds * 1000, 1000), 30_000)
}

/**
 * poll_url 归一化 + SSRF 防护:相对路径拼到网关 origin;
 * 绝对 URL 必须与网关同 origin,否则拒绝(轮询会携带用户 API Key)。
 */
export function resolveAsyncPollUrl(pollUrl: string, gatewayRootUrl: string) {
  const root = new URL(gatewayRootUrl)
  const resolved = new URL(pollUrl, root)
  if (resolved.origin !== root.origin) {
    throw new Error(`异步任务轮询地址跨源,已拒绝:${resolved.origin}`)
  }
  return resolved.toString()
}

export interface SubmitAsyncOptions {
  baseUrl: string
  paths?: string[]
  apiKey: string
  body: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function submitAsyncImageGeneration(options: SubmitAsyncOptions): Promise<AsyncSubmitResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const paths = options.paths ?? ['/images/generations/async', '/v1/images/generations/async']

  let response: Response | null = null
  let errorText = ''
  for (const path of paths) {
    response = await fetchImpl(`${options.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: options.body,
      signal: options.signal
    })
    if (response.ok) break
    errorText = await response.text().catch(() => '')
    if (response.status !== 404 && response.status !== 405) break
  }

  if (!response) throw new Error('异步生图接口无响应')
  if (response.status === 404 || response.status === 405) {
    throw new AsyncImageUnsupportedError(response.status)
  }
  if (!response.ok) {
    const payload = parsePayload(errorText)
    const error = new Error(payloadErrorMessage(payload, `异步生图提交失败:HTTP ${response.status}`)) as RequestError
    error.status = response.status
    throw error
  }

  const payload = parsePayload(await response.text().catch(() => ''))
  if (!payload.task_id || !payload.poll_url) {
    throw new Error('异步生图响应缺少 task_id/poll_url')
  }

  return {
    taskId: payload.task_id,
    pollUrl: payload.poll_url,
    retryAfterMs: retryAfterToMs(response.headers.get('retry-after'))
  }
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function extractCompletedImages(payload: AsyncTaskPayload) {
  const fromResult = (payload.result?.data || [])
    .filter(item => typeof item?.url === 'string' && item.url)
    .map(item => ({ url: item.url!, revised_prompt: item.revised_prompt }))
  if (fromResult.length) return fromResult
  if (payload.image_url) return [{ url: payload.image_url, revised_prompt: undefined }]
  return []
}

export interface PollAsyncOptions {
  pollUrl: string
  apiKey: string
  initialIntervalMs?: number
  maxWaitMs?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>
  onTick?: (info: { elapsedMs: number, status: string }) => void
}

export async function pollAsyncImageResult(options: PollAsyncOptions): Promise<AsyncPollOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepImpl = options.sleepImpl ?? defaultSleep
  const startedAt = Date.now()
  const deadline = startedAt + (options.maxWaitMs ?? asyncImageMaxWaitMs)
  let intervalMs = options.initialIntervalMs ?? asyncImageDefaultPollMs

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (Date.now() >= deadline) {
      throw new Error('异步生图任务等待超时(30 分钟),请稍后在网关侧确认结果')
    }

    const response = await fetchImpl(options.pollUrl, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: 'application/json'
      },
      signal: options.signal
    })

    const text = await response.text().catch(() => '')
    const payload = parsePayload(text)

    if (!response.ok) {
      // 轮询接口自身报错(404=任务不存在/过期等):直接失败,不重试同步以免双扣费
      const error = new Error(payloadErrorMessage(payload, `异步任务查询失败:HTTP ${response.status}`)) as RequestError
      error.status = response.status
      throw error
    }

    const status = (payload.status || '').toLowerCase()
    options.onTick?.({ elapsedMs: Date.now() - startedAt, status })

    if (status === 'completed') {
      const images = extractCompletedImages(payload)
      if (!images.length) {
        throw new Error('异步任务完成但未返回图片地址')
      }
      return {
        data: images,
        usage: payload.result?.usage ?? payload.usage
      }
    }

    if (status === 'failed') {
      const error = new Error(payloadErrorMessage(payload, '异步生图任务失败')) as RequestError
      error.status = payload.http_status
      throw error
    }

    intervalMs = retryAfterToMs(response.headers.get('retry-after')) || intervalMs
    await sleepImpl(intervalMs, options.signal)
  }
}
