import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/server/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src/renderer'],
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
