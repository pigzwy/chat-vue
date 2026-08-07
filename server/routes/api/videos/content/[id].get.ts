import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam, proxyRequest } from 'nitro/h3'
import { getVideoJob } from '../../../../utils/videoJobs'
import { sub2apiRootURL } from '../../../../utils/sub2api'

/**
 * 视频内容代理：上游返回的 /v1/videos/{id}/content 需带 API key 访问，
 * 浏览器无法直接播放，这里用任务里暂存的 key 转发。
 * 任务过期（2h TTL / 服务重启）后代理失效，前端引导用户及时下载。
 */
export default defineHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Video job id is required' })
  }

  const job = getVideoJob(id)
  if (!job || job.status !== 'completed' || !job.contentPath) {
    throw new HTTPError({ statusCode: 404, statusMessage: '视频已过期，请重新生成' })
  }

  return proxyRequest(event, `${sub2apiRootURL()}${job.contentPath}`, {
    headers: {
      'Authorization': `Bearer ${job.apiKey}`,
      'Accept-Encoding': 'identity'
    }
  })
})
