import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = mode === 'development' ? 'http://127.0.0.1:8000' : env.API_BASE_URL ?? ''

  return {
    define: {
      'import.meta.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
    },
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
