import { useCsrf } from '../useCsrf'
import type { RequestError } from '../../../shared/utils/errors'
import { fetchWithTimeout, readMediaJobResponse, wait } from './useImageGeneration'

export interface VideoJobRequest {
  prompt: string
  model: string
  /** 秒，1-15 */
  duration: number
  /** 480p / 720p */
  resolution?: string
  image?: File
}

const videoJobPollIntervalMs = 5000
const videoJobPollMaxMs = 20 * 60 * 1000

export async function createVideoGenerationJob(apiKey: string, task: VideoJobRequest) {
  const { csrf, headerName } = useCsrf()
  const formData = new FormData()
  formData.set('apiKey', apiKey)
  formData.set('model', task.model)
  formData.set('prompt', task.prompt)
  formData.set('duration', String(task.duration))
  if (task.resolution) {
    formData.set('resolution', task.resolution)
  }
  if (task.image) {
    formData.append('image', task.image)
  }

  const response = await fetchWithTimeout('/api/videos/jobs', {
    method: 'POST',
    headers: {
      [headerName]: csrf()
    },
    body: formData
  })

  return readMediaJobResponse(response, '视频任务创建失败')
}

export async function getVideoGenerationJob(jobId: string) {
  const response = await fetchWithTimeout(`/api/videos/jobs/${jobId}`, {
    headers: {
      Accept: 'application/json'
    }
  })

  return readMediaJobResponse(response, '视频任务查询失败')
}

export async function pollVideoGenerationJob(jobId: string, shouldStop?: () => boolean) {
  const deadline = Date.now() + videoJobPollMaxMs
  while (true) {
    if (shouldStop?.()) {
      throw new Error('视频任务已暂停，请刷新后继续查看')
    }
    if (Date.now() > deadline) {
      throw new Error('视频任务等待超时，请稍后重试')
    }

    const job = await getVideoGenerationJob(jobId)
    if (job.status === 'completed') {
      if (!job.data?.[0]?.url) {
        throw new Error('视频接口未返回视频地址')
      }

      return job
    }
    if (job.status === 'error') {
      if (job.jobErrorStatus) {
        const error = new Error(job.jobError || '视频生成失败') as RequestError
        error.status = job.jobErrorStatus
        throw error
      }
      throw new Error(job.jobError || '视频生成失败')
    }

    await wait(videoJobPollIntervalMs)
  }
}
