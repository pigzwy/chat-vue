import { defineHandler, HTTPError } from 'nitro'
import { z } from 'zod'
import { createImageEditJob } from '../../../../utils/imageJobs'

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

  const job = createImageEditJob({
    apiKey: payload.apiKey,
    prompt: payload.prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    size: imageSizeMap[payload.resolution][payload.ratio],
    images
  })

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt
  }
})
