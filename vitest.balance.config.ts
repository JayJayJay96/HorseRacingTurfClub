import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.slow.test.ts'],
    testTimeout: 600_000,
  },
});
