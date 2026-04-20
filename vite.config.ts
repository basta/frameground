import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { openDesignPlugin } from './server/plugin.ts'

export default defineConfig({
  plugins: [react(), openDesignPlugin()],
})
