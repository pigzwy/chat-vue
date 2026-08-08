import { proxyToBackend } from '@/lib/backend-proxy'

type RouteContext = { params: Promise<{ path: string[] }> }

async function handler(request: Request, context: RouteContext) {
  const { path } = await context.params
  return proxyToBackend(request, 'api', path)
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
