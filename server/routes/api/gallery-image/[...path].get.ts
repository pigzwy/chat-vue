import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam } from 'nitro/h3'

const galleryRepo = 'jamez-bondos/awesome-gpt4o-images'
const galleryBranch = 'main'
const rawBase = `https://raw.githubusercontent.com/${galleryRepo}/${galleryBranch}`
const cdnBase = `https://cdn.jsdelivr.net/gh/${galleryRepo}@${galleryBranch}`
// 只允许 cases/<dir>/<file>.<图片扩展名>，杜绝开放代理
const allowedPathPattern = /^cases\/[\w.-]+\/[\w.-]+\.(?:png|jpe?g|webp|gif)$/i

/**
 * 灵感墙图片代理：GitHub raw / jsDelivr 直链在部分网络不可达且直链可能失效，
 * 统一经本站转发并带长缓存。
 */
export default defineHandler(async (event) => {
  const path = getRouterParam(event, 'path') || ''
  if (!allowedPathPattern.test(path) || path.includes('..')) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  let upstream = await fetch(`${rawBase}/${path}`).catch(() => null)
  if (!upstream?.ok) {
    upstream = await fetch(`${cdnBase}/${path}`).catch(() => null)
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
