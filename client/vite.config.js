import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    // Sunucu hazır olunca tarayıcıyı otomatik aç
    open: '/index.html',
    host: 'localhost',
    port: 5173,
    strictPort: false,
  },
})
