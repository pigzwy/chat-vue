import { defineHandler, HTTPError } from 'nitro'
import { z } from 'zod'
import { createImageEditJob } from '../../../../utils/imageJobs'
import { imageQuality, imageSizeMap } from '../../../../../shared/utils/images'

const imageInputLimit = 8

const imageRatioSchema = z.enum(['1:1', '3:2', '16:9', '21:9', '9:16', '4:3', '3:4', 'Auto'])
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
    quality: imageQuality,
    images
  })

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt
  }
})
