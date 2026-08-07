import { useCsrf } from '../useCsrf'
import type { RequestError } from '../../../shared/utils/errors'
import type { ImageQuality, ImageRatio, ImageResolution } from '../../../shared/utils/images'

export interface GeneratedMediaPayload {
  b64_json?: string
  url?: string
  revised_prompt?: string
}

export interface MediaJobResponse {
  id: string
  status: 'queued' | 'running' | 'completed' | 'error'
  createdAt: string
  startedAt?: string
  completedAt?: string
  mode?: 'stream' | 'sync'
  streamAttempts?: number
  jobError?: string
  jobErrorStatus?: number
  data?: GeneratedMediaPayload[]
  error?: {
    message?: string
  }
}

export interface ImageJobRequest {
  prompt: string
  model: string
  ratio: ImageRatio
  resolution: ImageResolution
  quality: ImageQuality
  size: string
}

const mediaRequestTimeoutMs = 300000
const imageJobPollIntervalMs = 2500
const imageJobPollMaxMs = 10 * 60 * 1000

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

async function readJobResponse(response: Response, fallbackMessage: string) {
  let resultText = await response.text()
  const result = parseJson<MediaJobResponse>(resultText) || ({} as MediaJobResponse)
  if (!result?.error?.message && resultText.trim().startsWith('<')) {
    resultText = ''
  }
  if (!response.ok) {
    const error = new Error(result?.error?.message || resultText || `${fallbackMessage}: ${response.status}`) as RequestError
    error.status = response.status
    throw error
  }
  if (!result?.id) {
    throw new Error(fallbackMessage)
  }

  return result
}

export async function createImageGenerationJob(apiKey: string, task: ImageJobRequest) {
  const { csrf, headerName } = useCsrf()
  const response = await fetchWithTimeout('/api/images/jobs', {
    method: 'POST',
    headers: {
      [headerName]: csrf(),
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

  return readJobResponse(response, '图片任务创建失败')
}

export async function createImageEditJob(apiKey: string, task: ImageJobRequest, sources: File[]) {
  if (!sources.length) {
    throw new Error('缺少要编辑的图片')
  }

  const { csrf, headerName } = useCsrf()
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
      [headerName]: csrf()
    },
    body: formData
  })

  return readJobResponse(response, '图片编辑任务创建失败')
}

export async function getImageGenerationJob(jobId: string) {
  const response = await fetchWithTimeout(`/api/images/jobs/${jobId}`, {
    headers: {
      Accept: 'application/json'
    }
  })

  return readJobResponse(response, '图片任务查询失败')
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
