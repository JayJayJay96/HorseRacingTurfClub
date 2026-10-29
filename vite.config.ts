import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // The 10,000-race balance suite takes minutes; it runs via `npm run test:balance`.
    exclude: ['src/**/*.slow.test.ts', 'node_modules/**'],
  },
});
