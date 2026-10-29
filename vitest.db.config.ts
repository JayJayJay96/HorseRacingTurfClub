import { defineConfig } from 'vitest/config';

// Integration tests against the local Supabase stack. Needs `npx supabase start`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
