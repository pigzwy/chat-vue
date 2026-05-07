import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { getImageJob } from '../../../../utils/imageJobs'

export default defineHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Image job id is required' })
  }

  const job = getImageJob(id)
  if (!job) {
    throw new HTTPError({ statusCode: 404, statusMessage: '图片任务已失效，请重试' })
  }

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    mode: job.mode,
    streamAttempts: job.streamAttempts,
    jobError: job.error,
    jobErrorStatus: job.errorStatus,
    data: job.data
  }
})
