import type { NextConfig } from 'next'

// 后端桥接见 src/lib/backend-proxy.ts（rewrites 不透传 Set-Cookie，改用手写代理路由）
// 安全响应头（CSP frame-ancestors 等）见 src/proxy.ts：那里能读到运行时注入的 env
const nextConfig: NextConfig = {
  // Docker 精简镜像:只打包运行时必需文件到 .next/standalone
  output: 'standalone'
}

export default nextConfig
