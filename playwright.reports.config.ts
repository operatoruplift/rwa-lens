import { defineConfig, devices } from '@playwright/test';

/**
 * Saved reports and "Delete my data", against the same production build served
 * with RWA_REPORTS_ENABLED=true. The storage values are placeholders on reserved
 * .invalid hosts: every /api request is answered inside the browser, so the server
 * never contacts a database and no real wallet signs anything.
 */
export default defineConfig({
  testDir: './tests/e2e-reports',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_REPORTS_BASE_URL ?? 'http://127.0.0.1:3302',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_REPORTS_BASE_URL
    ? undefined
    : {
        command: 'npm run start -- --port 3302',
        env: {
          RWA_CLUSTER: 'mainnet-beta',
          RWA_FIXTURES_ENABLED: 'false',
          RWA_REPORTS_ENABLED: 'true',
          RWA_APP_ORIGIN: 'https://rwa-lens.invalid',
          RWA_SUPABASE_URL: 'https://reports.invalid',
          RWA_SUPABASE_SERVICE_ROLE_KEY: 'e2e-placeholder-not-a-key',
          RWA_SESSION_SECRET: 'e2e-placeholder-session-secret-not-used-elsewhere',
        },
        url: 'http://127.0.0.1:3302/rwa',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
