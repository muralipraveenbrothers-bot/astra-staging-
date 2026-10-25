import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')

  // FreeLLMAPI backend/API
  const serverPort = env.PORT ?? process.env.PORT ?? '3001'

  return {
    plugins: [react(), tailwindcss()],

    base: process.env.VITE_BASE ?? '/',

    envDir: path.resolve(__dirname, '..'),

    define: {
      __SERVER_PORT__: JSON.stringify(String(serverPort)),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      host: '0.0.0.0',

      // FreeLLMAPI dashboard
      port: 5170,

      strictPort: true,

      headers: {
        'Content-Security-Policy':
          "frame-ancestors 'self' http://localhost:5173 http://127.0.0.1:5173 http://localhost:5174 http://127.0.0.1:5174",
      },

      proxy: {
        // FreeLLMAPI API backend
        '/api': {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: true,
          secure: false,
        },

        // OpenAI-compatible FreeLLMAPI API
        '/v1': {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})