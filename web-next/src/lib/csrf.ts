export const csrfHeaderName = 'x-csrf-token'

/** 与 Nitro 服务端 csrf 中间件配套：读 cookie 值随请求头回传 */
export function getCsrfToken() {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}
