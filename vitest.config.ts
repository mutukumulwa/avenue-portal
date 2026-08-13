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
    //
    // `.next*` is excluded because vitest globs the project root for test files
    // and a production build writes ~50k files there. Vitest's defaults cover
    // node_modules and dist but not .next, so `next build` followed by
    // `npx vitest run` hangs at the RUN banner with no output and no test ever
    // starting — which reads as a broken test suite rather than a glob.
    //
    // The glob is `.next*`, not `.next`, because a wedged build directory gets
    // moved aside (`.next-wedged`) rather than deleted — iCloud can leave it
    // unremovable for long stretches — and a renamed copy re-creates the hang
    // just as effectively as the original.
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**', '**/.next*/**'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
