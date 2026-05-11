import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

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
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        register: resolve(__dirname, 'register.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        calendar: resolve(__dirname, 'calendar.html'),
        todo: resolve(__dirname, 'todo.html'),
        notes: resolve(__dirname, 'notes.html'),
        reminder: resolve(__dirname, 'reminder.html'),
        chat: resolve(__dirname, 'chat.html'),
        settings: resolve(__dirname, 'settings.html'),
        journal: resolve(__dirname, 'journal.html'),
        mindMap: resolve(__dirname, 'mind-map.html'),
        pomodoro: resolve(__dirname, 'pomodoro.html'),
        studyTimer: resolve(__dirname, 'study-timer.html'),
      },
    },
  },
})
