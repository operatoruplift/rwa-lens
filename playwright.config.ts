import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3300',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Fixture-only: no RPC is configured, which is also the guest path.
        command: 'npm run start -- --port 3300',
        url: 'http://127.0.0.1:3300/rwa',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
