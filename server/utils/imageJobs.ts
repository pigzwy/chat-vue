import { randomUUID } from 'node:crypto'
import { sub2apiBaseURL } from './sub2api'

type ImageRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'Auto'
type ImageResolution = '1K' | '2K' | '4K'
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
}

interface RequestError extends Error {
  status?: number
  streamStarted?: boolean
}

const imageModel = 'gpt-image-2'
const maxJobAgeMs = 1000 * 60 * 60
const imageJobs = new Map<string, ImageJob>()

function parseJson<T>(text: string) {
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function toErrorMessage(text: string, status: number, statusText: string) {
  if (status === 524) {
    return 'API 图片生成超时，建议降低分辨率或稍后重试'
  }

  const parsed = parseJson<ImageGenerationResponse>(text)
  if (parsed) {
    return parsed.error?.message || parsed.message || `API upstream returned ${status} ${statusText || 'error'}`
  }

  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return `API upstream returned ${status} ${statusText || 'error'}`
  }

  return trimmed.slice(0, 500)
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
    const error = new Error(event.error?.message || event.message) as RequestError
    error.streamStarted = true
    throw error
  }

  return event
}

async function readImageGenerationStream(response: Response) {
  if (!response.body) {
    throw new Error('图片流没有返回响应体')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completedImage: GeneratedImage | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        const event = parseStreamEvent(extractStreamData(block))
        if (!event) continue

        const image = toStreamImage(event)
        if (image) completedImage = image
      }
    }

    if (done) break
  }

  const tail = parseStreamEvent(extractStreamData(buffer))
  const tailImage = tail ? toStreamImage(tail) : null
  completedImage = tailImage || completedImage

  if (!completedImage) {
    throw new Error('图片流未返回最终图片')
  }

  return {
    data: [completedImage]
  } satisfies ImageGenerationResponse
}

async function callImageGeneration(job: ImageJob, stream: boolean) {
  const requestBody = JSON.stringify({
    model: imageModel,
    prompt: job.prompt,
    size: job.size,
    response_format: 'b64_json',
    n: 1,
    stream,
    ...(stream && { partial_images: 1 })
  })
  const upstreamPaths = ['/images/generations', '/v1/images/generations']
  let response: Response | null = null

  for (const path of upstreamPaths) {
    response = await fetch(`${sub2apiBaseURL()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${job.apiKey}`,
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json'
      },
      body: requestBody
    })

    if (response.ok || !isPathFallbackStatus(response.status)) break
    await response.text().catch(() => '')
  }

  if (!response) {
    throw new Error('Image API did not return response')
  }

  if (!response.ok) {
    const text = await response.text()
    const error = new Error(toErrorMessage(text, response.status, response.statusText)) as RequestError
    error.status = response.status
    throw error
  }

  if (stream && response.headers.get('Content-Type')?.includes('text/event-stream')) {
    try {
      return await readImageGenerationStream(response)
    } catch (error) {
      (error as RequestError).streamStarted = true
      throw error
    }
  }

  const text = await response.text()
  const result = parseJson<ImageGenerationResponse>(text) || {}
  const image = result.data?.[0]
  if (!image?.b64_json && !image?.url) {
    throw new Error('Image API did not return image data')
  }

  return {
    data: result.data
  } satisfies ImageGenerationResponse
}

async function requestImageGeneration(job: ImageJob) {
  try {
    return await callImageGeneration(job, true)
  } catch (error) {
    if (!shouldFallbackToNonStreaming(error)) {
      throw error
    }

    return callImageGeneration(job, false)
  }
}

async function callImageEdit(job: ImageJob) {
  if (!job.images?.length) {
    throw new Error('Image file is required')
  }

  const upstreamForm = new FormData()
  upstreamForm.set('model', imageModel)
  upstreamForm.set('prompt', job.prompt)
  upstreamForm.set('size', job.size)
  upstreamForm.set('response_format', 'b64_json')
  upstreamForm.set('n', '1')
  job.images.forEach((image) => {
    upstreamForm.append('image', image)
  })

  const upstreamPaths = ['/images/edits', '/v1/images/edits']
  let response: Response | null = null

  for (const path of upstreamPaths) {
    response = await fetch(`${sub2apiBaseURL()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${job.apiKey}`
      },
      body: upstreamForm
    })

    if (response.ok || !isPathFallbackStatus(response.status)) break
    await response.text().catch(() => '')
  }

  if (!response) {
    throw new Error('Image edit API did not return response')
  }

  const text = await response.text()
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

  return {
    data: result.data
  } satisfies ImageGenerationResponse
}

async function requestImageJob(job: ImageJob) {
  if (job.kind === 'edit') return callImageEdit(job)

  return requestImageGeneration(job)
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

  job.status = 'running'
  job.startedAt = new Date().toISOString()

  try {
    const result = await requestImageJob(job)
    const image = result.data?.[0]
    if (!image?.b64_json && !image?.url) {
      throw new Error('图片接口未返回图片数据')
    }

    job.status = 'completed'
    job.completedAt = new Date().toISOString()
    job.data = result.data
    job.images = undefined
  } catch (error) {
    job.status = 'error'
    job.completedAt = new Date().toISOString()
    job.errorStatus = (error as RequestError).status
    job.images = undefined
    job.error = error instanceof Error ? error.message : '图片生成失败'
  }
}
