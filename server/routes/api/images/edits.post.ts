import { defineHandler, HTTPError } from 'nitro'
import { z } from 'zod'
import { sub2apiBaseURL } from '../../../utils/sub2api'

const imageModel = 'gpt-image-2'
const imageInputLimit = 8
const imageSizeMap = {
  '1K': {
    '1:1': '1024x1024',
    '16:9': '1024x576',
    '9:16': '576x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
    Auto: 'auto'
  },
  '2K': {
    '1:1': '2048x2048',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    Auto: 'auto'
  },
  '4K': {
    '1:1': '4096x4096',
    '16:9': '4096x2304',
    '9:16': '2304x4096',
    '4:3': '4096x3072',
    '3:4': '3072x4096',
    Auto: 'auto'
  }
} as const

const imageRatioSchema = z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', 'Auto'])
const imageResolutionSchema = z.enum(['1K', '2K', '4K'])

interface ImageResponse {
  data?: Array<{
    b64_json?: string
    url?: string
    revised_prompt?: string
  }>
  error?: {
    message?: string
  }
  message?: string
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
  if (status === 524) {
    return 'Sub2API 图片编辑超时，建议降低分辨率或稍后重试'
  }

  const parsed = parseJson<ImageResponse>(text)
  if (parsed) {
    return parsed.error?.message || parsed.message || `Sub2API upstream returned ${status} ${statusText || 'error'}`
  }

  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return `Sub2API upstream returned ${status} ${statusText || 'error'}`
  }

  return trimmed.slice(0, 500)
}

function isPathFallbackStatus(status: number) {
  return status === 404 || status === 405
}

export default defineHandler(async (event) => {
  const form = await event.req.formData()
  const payload = z.object({
    apiKey: z.string().min(1),
    prompt: z.string().trim().min(1),
    ratio: imageRatioSchema,
    resolution: imageResolutionSchema
  }).parse({
    apiKey: form.get('apiKey'),
    prompt: form.get('prompt'),
    ratio: form.get('ratio'),
    resolution: form.get('resolution')
  })
  const images = form.getAll('image').filter((image): image is File => image instanceof File)
  if (!images.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Image file is required' })
  }
  if (images.length > imageInputLimit) {
    throw new HTTPError({ statusCode: 400, statusMessage: `Too many images. Maximum is ${imageInputLimit}` })
  }

  const upstreamForm = new FormData()
  upstreamForm.set('model', imageModel)
  upstreamForm.set('prompt', payload.prompt)
  upstreamForm.set('size', imageSizeMap[payload.resolution][payload.ratio])
  upstreamForm.set('response_format', 'b64_json')
  upstreamForm.set('n', '1')
  images.forEach((image) => {
    upstreamForm.append('image', image)
  })

  const upstreamPaths = ['/images/edits', '/v1/images/edits']
  let response: Response | null = null

  for (const path of upstreamPaths) {
    response = await fetch(`${sub2apiBaseURL()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${payload.apiKey}`
      },
      body: upstreamForm
    })

    if (response.ok || !isPathFallbackStatus(response.status)) break
    await response.text().catch(() => '')
  }

  if (!response) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Image edit API did not return response'
    })
  }

  const text = await response.text()
  if (!response.ok) {
    throw new HTTPError({
      statusCode: response.status,
      statusMessage: toErrorMessage(text, response.status, response.statusText)
    })
  }

  const result = parseJson<ImageResponse>(text) || {}
  const imageResult = result.data?.[0]
  if (!imageResult?.b64_json && !imageResult?.url) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Image API did not return image data'
    })
  }

  return {
    data: result.data
  }
})
