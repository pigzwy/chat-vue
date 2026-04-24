import { defineConfig, loadEnv } from 'vite'
import { nitro } from 'nitro/vite'
import vue from '@vitejs/plugin-vue'
import vueRouter from 'vue-router/vite'
import vueLayouts from 'vite-plugin-vue-layouts'
import vueDevtools from 'vite-plugin-vue-devtools'
import ui from '@nuxt/ui/vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const sub2apiTarget = env.VITE_SUB2API_BASE_URL || 'http://localhost:8080'

  return {
    server: {
      proxy: {
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
      vueRouter({
        dts: 'src/route-map.d.ts'
      }),
      vueLayouts(),
      vueDevtools(),
      vue(),
      ui({
        prose: true,
        ui: {
          colors: {
            primary: 'blue',
            neutral: 'zinc'
          }
        }
      }),
      nitro({
        serverDir: './server'
      })
    ]
  }
})
