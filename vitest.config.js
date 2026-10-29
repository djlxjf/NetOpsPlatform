import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    },
    include: ['tests/unit/**/*.test.js', 'tests/unit/**/*.spec.js'],
    exclude: ['node_modules', 'dist', 'release', 'coverage'],
    setupFiles: ['tests/setup.js']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
