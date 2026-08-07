import { Buffer } from 'node:buffer'
import { defineHandler, HTTPError } from 'nitro'
import { z } from 'zod'
import { createVideoJob } from '../../../../utils/videoJobs'
import { videoDurationSchema, videoModelSchema, videoResolutionSchema } from '../../../../../shared/utils/mediaSchemas'

const videoImageMaxBytes = 10 * 1024 * 1024
const videoImageTypes = ['image/png', 'image/jpeg', 'image/webp']

export default defineHandler(async (event) => {
  const form = await event.req.formData()
  const payload = z.object({
    apiKey: z.string().min(1),
    model: videoModelSchema,
    prompt: z.string().trim().min(1),
    duration: videoDurationSchema,
    resolution: videoResolutionSchema.optional()
  }).parse({
    apiKey: form.get('apiKey'),
    model: form.get('model'),
    prompt: form.get('prompt'),
    duration: form.get('duration'),
    resolution: form.get('resolution') ?? undefined
  })

  const imageEntry = form.get('image')
  let image: { data: string, mediaType: string } | undefined
  if (imageEntry instanceof File && imageEntry.size > 0) {
    if (!videoImageTypes.includes(imageEntry.type)) {
      throw new HTTPError({ statusCode: 400, statusMessage: '源图仅支持 PNG/JPG/WebP 格式' })
    }
    if (imageEntry.size > videoImageMaxBytes) {
      throw new HTTPError({ statusCode: 400, statusMessage: '源图大小不能超过 10MB' })
    }
    image = {
      data: Buffer.from(await imageEntry.arrayBuffer()).toString('base64'),
      mediaType: imageEntry.type
    }
  }

  const job = createVideoJob({
    apiKey: payload.apiKey,
    model: payload.model,
    prompt: payload.prompt,
    duration: payload.duration,
    resolution: payload.resolution,
    image
  })

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt
  }
})
