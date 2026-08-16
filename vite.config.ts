import { defineConfig, loadEnv } from 'vite'
import { nitro } from 'nitro/vite'

// 本仓库自 2026-08-16 起只出后端(Nitro):
// React 前端已迁至独立仓库 pigzwy/pig-studio,原 Vue 前端随之删除。
// 构建仍走 vite,因为 Nitro 3 由 nitro/vite 插件驱动;产物是 .output/server。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const sub2apiTarget = env.VITE_SUB2API_BASE_URL || 'http://localhost:8080'

  return {
    server: {
      proxy: {
        // 仅本地 dev 直连网关用;生产由 server/routes/sub2api 代理
        '/sub2api': {
          target: sub2apiTarget,
          changeOrigin: true,
          headers: {
            'Accept-Encoding': 'identity'
          },
          rewrite: path => path.replace(/^\/sub2api/, '')
        }
      }
    },
    plugins: [
      nitro({
        serverDir: './server'
      })
    ]
  }
})
