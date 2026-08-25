import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'app/src'),
    },
  },
  test: {
    // Pure logic only — no DOM environment needed, so no jsdom dependency.
    environment: 'node',
    include: ['app/src/**/*.test.{ts,tsx}'],
  },
})
