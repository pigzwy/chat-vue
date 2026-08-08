// 迁移期后端桥接：/api/* 与 /sub2api/* 手动代理到现有 Nitro 服务。
// 不用 next.config rewrites 的原因：Next 16 的 rewrites 不透传 Set-Cookie，
// Nitro 的 CSRF cookie 无法建立（实测确认）。
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://localhost:3000'

const forwardRequestHeaders = ['cookie', 'x-csrf-token', 'authorization', 'content-type', 'accept', 'accept-encoding', 'range']
const dropResponseHeaders = ['transfer-encoding', 'connection', 'keep-alive', 'content-encoding', 'content-length', 'set-cookie']

export async function proxyToBackend(request: Request, prefix: string, pathSegments: string[]) {
  const url = new URL(request.url)
  const target = `${backendOrigin}/${prefix}/${pathSegments.join('/')}${url.search}`

  const headers = new Headers()
  for (const name of forwardRequestHeaders) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual'
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }

  const upstream = await fetch(target, init)

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (dropResponseHeaders.includes(key.toLowerCase())) return
    responseHeaders.append(key, value)
  })
  for (const cookie of upstream.headers.getSetCookie?.() || []) {
    responseHeaders.append('set-cookie', cookie)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  })
}
