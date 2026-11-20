import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { promptEnginePlugin } from './server/promptEnginePlugin'

function appRouteRewritePlugin(): Plugin {
  const handle = (
    req: { url?: string },
    res: { statusCode: number; setHeader: (name: string, value: string) => void; end: () => void }
  ): boolean => {
    if (!req.url) return false
    const labMatch = /^\/lab\/?(\?.*)?$/.exec(req.url)
    if (labMatch) {
      const query = labMatch[1] ?? ''
      res.statusCode = 302
      res.setHeader('Location', `/${query}`)
      res.end()
      return true
    }
    if (req.url === '/legacy' || req.url.startsWith('/legacy?')) {
      req.url = req.url.replace(/^\/legacy/, '/legacy/index.html')
    } else if (req.url === '/design-system' || req.url.startsWith('/design-system?')) {
      req.url = req.url.replace(/^\/design-system/, '/design-system/index.html')
    }
    return false
  }

  return {
    name: 'app-route-rewrite',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handle(req, res)) next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handle(req, res)) next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appRouteRewritePlugin(), promptEnginePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        legacy: path.resolve(import.meta.dirname, 'legacy/index.html'),
        designSystem: path.resolve(import.meta.dirname, 'design-system/index.html'),
      },
    },
  },
  server: {
    port: 5178,
  },
})
