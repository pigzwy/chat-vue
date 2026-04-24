import { defineHandler, HTTPError } from 'nitro'
import { readValidatedBody } from 'nitro/h3'
import { z } from 'zod'
import { sub2apiBaseURL } from '../../../utils/sub2api'

const imageModel = 'gpt-image-2'
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

interface ImageGenerationResponse {
  data?: Array<{
    b64_json?: string
    url?: string
    revised_prompt?: string
  }>
  error?: {
    message?: string
  }
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
  const parsed = parseJson<ImageGenerationResponse & { message?: string }>(text)
  if (parsed) {
    return parsed.error?.message || parsed.message || `Sub2API upstream returned ${status} ${statusText || 'error'}`
  }

  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return `Sub2API upstream returned ${status} ${statusText || 'error'}`
  }

  return trimmed.slice(0, 500)
}

export default defineHandler(async (event) => {
  const { apiKey, prompt, ratio, resolution } = await readValidatedBody(event, z.object({
    apiKey: z.string().min(1),
    prompt: z.string().trim().min(1),
    ratio: imageRatioSchema,
    resolution: imageResolutionSchema,
    size: z.string().trim().min(1).optional()
  }).parse)
  const size = imageSizeMap[resolution][ratio]

  const upstreamUrl = `${sub2apiBaseURL()}/images/generations`
  const response = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: imageModel,
      prompt,
      size,
      response_format: 'b64_json',
      n: 1
    })
  })

  const text = await response.text()
  if (!response.ok) {
    throw new HTTPError({
      statusCode: response.status,
      statusMessage: toErrorMessage(text, response.status, response.statusText)
    })
  }

  const result = parseJson<ImageGenerationResponse>(text) || {}
  const image = result.data?.[0]
  if (!image?.b64_json && !image?.url) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Image API did not return image data'
    })
  }

  return {
    data: result.data
  }
})
