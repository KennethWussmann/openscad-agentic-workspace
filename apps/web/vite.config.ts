import { scadWorkspace } from '@scad/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), scadWorkspace()],
  server: {
    host: 'localhost',
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
