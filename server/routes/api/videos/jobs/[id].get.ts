import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { getVideoJob } from '../../../../utils/videoJobs'

export default defineHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Video job id is required' })
  }

  const job = getVideoJob(id)
  if (!job) {
    throw new HTTPError({ statusCode: 404, statusMessage: '视频任务已失效，请重试' })
  }

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    requestId: job.requestId,
    jobError: job.error,
    jobErrorStatus: job.errorStatus,
    data: job.data
  }
})
