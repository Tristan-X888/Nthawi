import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/auth.integration.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
