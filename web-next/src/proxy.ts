import { NextResponse } from 'next/server'

/**
 * 全站安全响应头(Next 16 的 proxy 约定,即旧版 middleware)。
 *
 * 放这里而不是 next.config 的 headers():后者在**构建期**烘进 routes-manifest,
 * 而 GATEWAY_ORIGIN 是运行时由 compose 注入的,构建期读不到。
 *
 * frame-ancestors 不能一刀切 DENY——网关菜单要用 iframe 嵌 studio;
 * 但也不能人人可嵌:localStorage 里存着 access/refresh token 与分组密钥,
 * 任意站点可嵌意味着点击劫持能替登录用户下单生成、删历史。
 */
function frameAncestors() {
  const configured = process.env.FRAME_ANCESTORS || process.env.GATEWAY_ORIGIN || ''
  const sources = configured
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(Boolean)
  return ["'self'", ...sources].join(' ')
}

export function proxy() {
  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', `frame-ancestors ${frameAncestors()}`)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // 跨站跳转不带完整 URL:SSO 接力页的 ?token= 不应经 Referer 外泄
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return response
}

export const config = {
  // 静态资源与图片优化产物不需要这些头,跳过以省开销
  matcher: '/((?!_next/static|_next/image).*)'
}
