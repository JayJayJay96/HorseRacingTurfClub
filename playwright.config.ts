import { defineConfig, devices } from '@playwright/test';
import { localEnv } from './tests/db/helpers.ts';

// E2E against the local Supabase stack (`npx supabase start`). The dev server gets the local URL and
// key from `supabase status` (process env beats `.env.local` in Vite), so the specs can never drive
// the hosted project even if `.env.local` points there.
const local = localEnv();
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(local.API_URL ?? '')) {
  throw new Error('E2E only runs against the local Supabase stack.');
}

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
    env: {
      VITE_SUPABASE_URL: local.API_URL!,
      VITE_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY!,
    },
  },
});
