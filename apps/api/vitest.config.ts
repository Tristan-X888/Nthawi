import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve the path aliases declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    // Keep test execution bounded separately from Nest module setup.
    testTimeout: 10_000,
    hookTimeout: 30_000,
  },
});
