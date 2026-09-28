import { defineConfig, devices } from '@playwright/test';

/**
 * The operator-gated deploy flow, against the same production build served
 * with RWA_DEPLOY_ENABLED=true. The wallet and every API response are mocked;
 * nothing is signed or sent.
 */
export default defineConfig({
  testDir: './tests/e2e-deploy',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_DEPLOY_BASE_URL ?? 'http://127.0.0.1:3301',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_DEPLOY_BASE_URL
    ? undefined
    : {
        command: 'npm run start -- --port 3301',
        env: { RWA_CLUSTER: 'mainnet-beta', RWA_FIXTURES_ENABLED: 'false', RWA_DEPLOY_ENABLED: 'true' },
        url: 'http://127.0.0.1:3301/rwa',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
