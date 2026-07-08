import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Never pick up test copies inside git worktrees created under .claude/.
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
