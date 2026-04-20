import type { Plugin } from 'vite'
import { ensureRoot } from './projects.ts'
import { handleApi, handleFrames } from './api.ts'

export function openDesignPlugin(): Plugin {
  return {
    name: 'opendesign-server',
    configureServer(server) {
      ensureRoot()
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (url.startsWith('/api/')) {
          await handleApi(req, res)
          return
        }
        if (url.startsWith('/frames/')) {
          if (handleFrames(req, res)) return
        }
        next()
      })
    },
  }
}
