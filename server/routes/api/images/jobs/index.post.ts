import { defineHandler, HTTPError } from 'nitro'
import { readValidatedBody } from 'nitro/h3'
import { z } from 'zod'
import { createImageJob } from '../../../../utils/imageJobs'
import { defaultImageQuality, imageSizeMap } from '../../../../../shared/utils/images'

const imageRatioSchema = z.enum(['1:1', '3:2', '16:9', '21:9', '9:16', '4:3', '3:4', 'Auto'])
const imageResolutionSchema = z.enum(['1K', '2K', '4K'])
const imageQualitySchema = z.enum(['low', 'medium', 'high'])

export default defineHandler(async (event) => {
  const { apiKey, prompt, ratio, resolution, quality, size, stream } = await readValidatedBody(event, z.object({
    apiKey: z.string().min(1),
    prompt: z.string().trim().min(1),
    ratio: imageRatioSchema,
    resolution: imageResolutionSchema,
    quality: imageQualitySchema.optional(),
    size: z.string().trim().min(1).optional(),
    stream: z.boolean().optional()
  }).parse)
  const expectedSize = imageSizeMap[resolution][ratio]
  if (size && size !== expectedSize) {
    throw new HTTPError({
      statusCode: 400,
      statusMessage: `Invalid image size for ${resolution} ${ratio}. Expected ${expectedSize}`
    })
  }

  const job = createImageJob({
    apiKey,
    prompt,
    ratio,
    resolution,
    size: size || expectedSize,
    quality: quality || defaultImageQuality,
    stream
  })

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt
  }
})
