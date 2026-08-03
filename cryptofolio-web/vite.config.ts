import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    // infra/lambda uses the node:test runner (its own `node --test` CI step), not Vitest.
    exclude: [...configDefaults.exclude, 'infra/**'],
  },
})
