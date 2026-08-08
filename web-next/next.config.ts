import type { NextConfig } from 'next'

// 后端桥接见 src/lib/backend-proxy.ts（rewrites 不透传 Set-Cookie，改用手写代理路由）
const nextConfig: NextConfig = {}

export default nextConfig
