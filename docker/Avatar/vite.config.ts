import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    cors: {
      origin: '*',
      methods: ['GET', 'HEAD', 'PUT', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Range', 'Accept', 'Origin'],
      maxAge: 600,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Origin',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_SHARE_API_BASE_URL ?? 'http://127.0.0.1:5500',
        changeOrigin: true,
      },
      '/ask': {
        target: process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/tts': {
        target: process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/voice': {
        target: process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/transcribe': {
        target: process.env.VITE_STT_BASE_URL ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
