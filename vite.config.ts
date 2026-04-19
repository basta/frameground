import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const framesDir = path.resolve(process.env.FRAMES_DIR || 'public/frames')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-frames',
      configureServer(server) {
        server.middlewares.use('/frames', (req, res, next) => {
          const filePath = path.join(framesDir, req.url?.split('?')[0] || '')
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Cache-Control', 'no-cache')
            fs.createReadStream(filePath).pipe(res)
          } else {
            next()
          }
        })
      },
    },
  ],
})
