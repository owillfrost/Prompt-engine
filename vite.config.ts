import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { promptEnginePlugin } from './server/promptEnginePlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), promptEnginePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5178,
  },
})
