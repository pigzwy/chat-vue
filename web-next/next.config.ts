import type { NextConfig } from 'next'

// 后端桥接见 src/lib/backend-proxy.ts（rewrites 不透传 Set-Cookie，改用手写代理路由）
const nextConfig: NextConfig = {
  // Docker 精简镜像:只打包运行时必需文件到 .next/standalone
  output: 'standalone'
}

export default nextConfig
