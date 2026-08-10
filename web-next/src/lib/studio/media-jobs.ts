// 自 useImageGeneration.ts / useVideoGeneration.ts 移植：媒体任务的创建与轮询
import { csrfHeaderName, getCsrfToken } from '@/lib/csrf'
import type { RequestError } from '@/lib/shared/errors'
import type { ImageQuality, ImageRatio, ImageResolution } from '@/lib/shared/images'

export interface GeneratedMediaPayload {
  b64_json?: string
  url?: string
  revised_prompt?: string
  mime_type?: string
}

export interface MediaJobResponse {
  id: string
  status: 'queued' | 'running' | 'completed' | 'error'
  createdAt: string
  startedAt?: string
  completedAt?: string
  mode?: 'stream' | 'sync'
  streamAttempts?: number
  /** 上游返回的本次实际扣费（美元） */
  costUsd?: number
  jobError?: string
  jobErrorStatus?: number
  data?: GeneratedMediaPayload[]
  /** 开发模式是 {message} 对象；生产模式 Nitro 输出 error: true + 顶层 message */
  error?: { message?: string } | boolean
  message?: string
  statusMessage?: string
}

export interface ImageJobRequest {
  prompt: string
  model: string
  ratio: ImageRatio
  resolution: ImageResolution
  quality: ImageQuality
  size: string
}

export interface VideoJobRequest {
  prompt: string
  model: string
  /** 秒，1-15 */
  duration: number
  /** 480p / 720p */
  resolution?: string
  image?: File
}

const mediaRequestTimeoutMs = 300000
const imageJobPollIntervalMs = 2500
const imageJobPollMaxMs = 10 * 60 * 1000
const videoJobPollIntervalMs = 5000
const videoJobPollMaxMs = 20 * 60 * 1000

export function parseJson<T>(text: string) {
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), mediaRequestTimeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

function extractJobErrorMessage(result: MediaJobResponse | null) {
  if (result && typeof result.error === 'object' && result.error?.message) return result.error.message
  return result?.message || result?.statusMessage || ''
}

export async function readMediaJobResponse(response: Response, fallbackMessage: string) {
  let resultText = await response.text()
  const result = parseJson<MediaJobResponse>(resultText) || ({} as MediaJobResponse)
  const errorMessage = extractJobErrorMessage(result)
  if (!errorMessage && resultText.trim().startsWith('<')) {
    resultText = ''
  }
  if (!response.ok) {
    const error = new Error(errorMessage || resultText || `${fallbackMessage}: ${response.status}`) as RequestError
    error.status = response.status
    throw error
  }
  if (!result?.id) {
    throw new Error(fallbackMessage)
  }

  return result
}

export async function createImageGenerationJob(apiKey: string, task: ImageJobRequest) {
  const response = await fetchWithTimeout('/api/images/jobs', {
    method: 'POST',
    headers: {
      [csrfHeaderName]: getCsrfToken(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      apiKey,
      prompt: task.prompt,
      model: task.model,
      ratio: task.ratio,
      resolution: task.resolution,
      quality: task.quality,
      size: task.size
    })
  })

  return readMediaJobResponse(response, '图片任务创建失败')
}

export async function createImageEditJob(apiKey: string, task: ImageJobRequest, sources: File[]) {
  if (!sources.length) {
    throw new Error('缺少要编辑的图片')
  }

  const formData = new FormData()
  formData.set('apiKey', apiKey)
  formData.set('prompt', task.prompt)
  formData.set('model', task.model)
  formData.set('ratio', task.ratio)
  formData.set('resolution', task.resolution)
  formData.set('quality', task.quality)
  formData.set('size', task.size)
  sources.forEach((source) => {
    formData.append('image', source)
  })

  const response = await fetchWithTimeout('/api/images/jobs/edits', {
    method: 'POST',
    headers: {
      [csrfHeaderName]: getCsrfToken()
    },
    body: formData
  })

  return readMediaJobResponse(response, '图片编辑任务创建失败')
}

export async function getImageGenerationJob(jobId: string) {
  const response = await fetchWithTimeout(`/api/images/jobs/${jobId}`, {
    headers: {
      Accept: 'application/json'
    }
  })

  return readMediaJobResponse(response, '图片任务查询失败')
}

export async function pollImageGenerationJob(jobId: string, shouldStop?: () => boolean) {
  const deadline = Date.now() + imageJobPollMaxMs
  while (true) {
    if (shouldStop?.()) {
      throw new Error('图片任务已暂停，请刷新后继续查看')
    }
    if (Date.now() > deadline) {
      throw new Error('图片任务等待超时，请稍后重试')
    }

    const job = await getImageGenerationJob(jobId)
    if (job.status === 'completed') {
      if (!job.data?.[0]?.b64_json && !job.data?.[0]?.url) {
        throw new Error('图片接口未返回图片数据')
      }

      return job
    }
    if (job.status === 'error') {
      if (job.jobErrorStatus) {
        const error = new Error(job.jobError || '图片生成失败') as RequestError
        error.status = job.jobErrorStatus
        throw error
      }
      throw new Error(job.jobError || '图片生成失败')
    }

    await wait(imageJobPollIntervalMs)
  }
}

export async function createVideoGenerationJob(apiKey: string, task: VideoJobRequest) {
  const formData = new FormData()
  formData.set('apiKey', apiKey)
  formData.set('model', task.model)
  formData.set('prompt', task.prompt)
  formData.set('duration', String(task.duration))
  if (task.resolution) {
    formData.set('resolution', task.resolution)
  }
  if (task.image) {
    formData.append('image', task.image)
  }

  const response = await fetchWithTimeout('/api/videos/jobs', {
    method: 'POST',
    headers: {
      [csrfHeaderName]: getCsrfToken()
    },
    body: formData
  })

  return readMediaJobResponse(response, '视频任务创建失败')
}

export async function getVideoGenerationJob(jobId: string) {
  const response = await fetchWithTimeout(`/api/videos/jobs/${jobId}`, {
    headers: {
      Accept: 'application/json'
    }
  })

  return readMediaJobResponse(response, '视频任务查询失败')
}

export async function pollVideoGenerationJob(jobId: string, shouldStop?: () => boolean) {
  const deadline = Date.now() + videoJobPollMaxMs
  while (true) {
    if (shouldStop?.()) {
      throw new Error('视频任务已暂停，请刷新后继续查看')
    }
    if (Date.now() > deadline) {
      throw new Error('视频任务等待超时，请稍后重试')
    }

    const job = await getVideoGenerationJob(jobId)
    if (job.status === 'completed') {
      if (!job.data?.[0]?.url) {
        throw new Error('视频接口未返回视频地址')
      }

      return job
    }
    if (job.status === 'error') {
      if (job.jobErrorStatus) {
        const error = new Error(job.jobError || '视频生成失败') as RequestError
        error.status = job.jobErrorStatus
        throw error
      }
      throw new Error(job.jobError || '视频生成失败')
    }

    await wait(videoJobPollIntervalMs)
  }
}
