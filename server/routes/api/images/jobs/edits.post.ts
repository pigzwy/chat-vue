import { defineHandler, HTTPError } from 'nitro'
import { z } from 'zod'
import { createImageEditJob } from '../../../../utils/imageJobs'
import { defaultImageQuality, imageSizeMap } from '../../../../../shared/utils/images'

const imageInputLimit = 8

const imageRatioSchema = z.enum(['1:1', '3:2', '16:9', '21:9', '9:16', '4:3', '3:4', 'Auto'])
const imageResolutionSchema = z.enum(['1K', '2K', '4K'])
const imageQualitySchema = z.enum(['low', 'medium', 'high'])

function parseOptionalFormBoolean(value: unknown) {
  if (typeof value !== 'string') return undefined
  return value.toLowerCase() === 'true'
}

export default defineHandler(async (event) => {
  const form = await event.req.formData()
  const payload = z.object({
    apiKey: z.string().min(1),
    prompt: z.string().trim().min(1),
    ratio: imageRatioSchema,
    resolution: imageResolutionSchema,
    quality: imageQualitySchema.optional(),
    size: z.string().trim().min(1).optional()
  }).parse({
    apiKey: form.get('apiKey'),
    prompt: form.get('prompt'),
    ratio: form.get('ratio'),
    resolution: form.get('resolution'),
    quality: form.get('quality'),
    size: form.get('size')
  })
  const images = form.getAll('image').filter((image): image is File => image instanceof File)
  if (!images.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Image file is required' })
  }
  if (images.length > imageInputLimit) {
    throw new HTTPError({ statusCode: 400, statusMessage: `Too many images. Maximum is ${imageInputLimit}` })
  }

  const expectedSize = imageSizeMap[payload.resolution][payload.ratio]
  if (payload.size && payload.size !== expectedSize) {
    throw new HTTPError({
      statusCode: 400,
      statusMessage: `Invalid image size for ${payload.resolution} ${payload.ratio}. Expected ${expectedSize}`
    })
  }

  const job = createImageEditJob({
    apiKey: payload.apiKey,
    prompt: payload.prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    size: payload.size || expectedSize,
    quality: payload.quality || defaultImageQuality,
    stream: parseOptionalFormBoolean(form.get('stream')),
    images
  })

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt
  }
})
