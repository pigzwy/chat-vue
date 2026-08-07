import { defineHandler, HTTPError } from 'nitro'
import { z } from 'zod'
import { createImageEditJob } from '../../../../utils/imageJobs'
import { defaultImageQuality, imageSizeMap } from '../../../../../shared/utils/images'
import { resolveMediaModelSpec } from '../../../../../shared/utils/mediaModels'
import { imageModelSchema, imageQualitySchema, imageRatioSchema, imageResolutionSchema } from '../../../../../shared/utils/mediaSchemas'

const imageInputLimit = 8

function parseOptionalFormBoolean(value: unknown) {
  if (typeof value !== 'string') return undefined
  return value.toLowerCase() === 'true'
}

export default defineHandler(async (event) => {
  const form = await event.req.formData()
  const payload = z.object({
    apiKey: z.string().min(1),
    prompt: z.string().trim().min(1),
    model: imageModelSchema.optional(),
    ratio: imageRatioSchema,
    resolution: imageResolutionSchema,
    quality: imageQualitySchema.optional(),
    size: z.string().trim().min(1).optional()
  }).parse({
    apiKey: form.get('apiKey'),
    prompt: form.get('prompt'),
    model: form.get('model') ?? undefined,
    ratio: form.get('ratio'),
    resolution: form.get('resolution'),
    quality: form.get('quality') ?? undefined,
    size: form.get('size') ?? undefined
  })
  if (payload.model && !resolveMediaModelSpec(payload.model).supportsEdit) {
    throw new HTTPError({ statusCode: 400, statusMessage: '该模型不支持图片编辑，请切换到 GPT Image 2' })
  }

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
    model: payload.model,
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
