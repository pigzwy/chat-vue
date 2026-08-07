import { defineHandler, HTTPError } from 'nitro'
import { getRequestHeader, getRouterParam } from 'nitro/h3'
import { getVideoJob } from '../../../../utils/videoJobs'
import { sub2apiRootURL } from '../../../../utils/sub2api'

/**
 * 视频内容代理：上游返回的 /v1/videos/{id}/content 需带 API key 访问，
 * 浏览器无法直接播放，这里用任务里暂存的 key 转发。
 * 手动 fetch 而非 proxyRequest：只透传 Range，不把浏览器 Cookie 等头带给上游。
 * 任务过期（2h TTL / 服务重启）后代理失效，前端引导用户及时下载。
 */
export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Video job id is required' })
  }

  const job = getVideoJob(id)
  if (!job || job.status !== 'completed' || !job.contentPath) {
    throw new HTTPError({ statusCode: 404, statusMessage: '视频已过期，请重新生成' })
  }

  const range = getRequestHeader(event, 'range')
  const upstream = await fetch(`${sub2apiRootURL()}${job.contentPath}`, {
    headers: {
      'Authorization': `Bearer ${job.apiKey}`,
      'Accept-Encoding': 'identity',
      ...(range ? { Range: range } : {})
    }
  })

  if (!upstream.ok) {
    throw new HTTPError({
      statusCode: upstream.status === 404 ? 404 : 502,
      statusMessage: upstream.status === 404 ? '视频已过期，请重新生成' : '视频拉取失败，请稍后重试'
    })
  }

  const headers = new Headers()
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag']) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'video/mp4')
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers
  })
})
