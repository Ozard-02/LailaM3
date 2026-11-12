import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Large-input performance harness. Kept out of `npm test`: it builds 20k-track
 * fixtures and takes seconds. Run with `npm run profile:core`.
 */
export default defineConfig({
  define: {
    __DEV__: 'true',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/bench/**/*.bench.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 300_000,
    silent: false,
  },
});
