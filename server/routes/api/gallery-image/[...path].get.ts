import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam } from 'nitro/h3'

// 双上游:cases/* → jamez-bondos 库;images/* → EvoLinkAI 历史库(原仓库已删,mageia 镜像存续)
const sources = [
  {
    pattern: /^cases\/[\w.-]+\/[\w.-]+\.(?:png|jpe?g|webp|gif)$/i,
    repo: 'jamez-bondos/awesome-gpt4o-images'
  },
  {
    pattern: /^images\/[\w.-]+\/[\w.-]+\.(?:png|jpe?g|webp|gif)$/i,
    repo: 'mageia/awesome-gpt-image-2-API-and-Prompts'
  }
] as const

/**
 * 灵感墙图片代理：GitHub raw / jsDelivr 直链在部分网络不可达且直链可能失效，
 * 统一经本站转发并带长缓存。路径白名单杜绝开放代理。
 */
export default defineHandler(async (event) => {
  const path = getRouterParam(event, 'path') || ''
  const source = path.includes('..') ? undefined : sources.find(item => item.pattern.test(path))
  if (!source) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  let upstream = await fetch(`https://raw.githubusercontent.com/${source.repo}/main/${path}`).catch(() => null)
  if (!upstream?.ok) {
    upstream = await fetch(`https://cdn.jsdelivr.net/gh/${source.repo}@main/${path}`).catch(() => null)
  }
  if (!upstream?.ok) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  const headers = new Headers()
  const contentType = upstream.headers.get('content-type')
  headers.set('content-type', contentType && contentType.startsWith('image/') ? contentType : 'image/png')
  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers.set('content-length', contentLength)
  headers.set('cache-control', 'public, max-age=604800')

  return new Response(upstream.body, { status: 200, headers })
})
