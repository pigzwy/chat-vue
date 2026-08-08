import type { NextConfig } from 'next'

// 迁移期后端桥接：API 仍由现有 Nitro 服务提供（本地 pnpm dev 起在 3000）
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://localhost:3000'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backendOrigin}/api/:path*` },
      { source: '/sub2api/:path*', destination: `${backendOrigin}/sub2api/:path*` }
    ]
  }
}

export default nextConfig
