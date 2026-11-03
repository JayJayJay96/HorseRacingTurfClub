import { defineConfig, devices } from '@playwright/test';

// E2E against the local Supabase stack (`npx supabase start`); `.env.local` points the app at it.
export default defineConfig({
  testDir: 'tests/e2e',
  // Specs share the permanent office room (one host at a time), so they run one by one.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
