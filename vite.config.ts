import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// The Vite app lives in ./app so that the original vanilla prototype at
// ./index.html is preserved untouched as a reference artifact.
export default defineConfig({
  root: path.resolve(rootDir, 'app'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'app/src'),
    },
  },
  css: {
    // PostCSS/Tailwind config live at the repo root, not at the Vite root.
    postcss: rootDir,
  },
  build: {
    outDir: path.resolve(rootDir, 'dist'),
    emptyOutDir: true,
  },
})
