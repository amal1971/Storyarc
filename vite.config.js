import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev API bridge: serves the same serverless functions in `api/` during
// `npm run dev`, loading keys from .env.local. This means plugging in an API
// key locally is just: cp .env.example .env.local → paste key → npm run dev.
// In production the identical files run as Vercel/Netlify functions.
function devApiPlugin() {
  return {
    name: 'storyarc-dev-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v

      server.middlewares.use('/api', (req, res) => {
        const name = (req.url || '/').split('?')[0].replace(/^\/+/, '')
        if (!/^[a-z0-9-]+$/i.test(name)) {
          res.statusCode = 404
          return res.end('not found')
        }
        ;(async () => {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          if (req.method !== 'GET') {
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              req.body = raw ? JSON.parse(raw) : {}
            } catch {
              req.body = {}
            }
          }
          res.status = (code) => {
            res.statusCode = code
            return res
          }
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
          }
          await mod.default(req, res)
        })().catch((err) => {
          console.error(`[dev-api] /${name}:`, err.message)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'dev api error' }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApiPlugin()],
})
