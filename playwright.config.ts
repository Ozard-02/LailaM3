import { defineConfig, devices } from '@playwright/test';

// Day to day: every functional test on Chromium desktop, viewport/touch tests
// on mobile, and a single Firefox check for the web progress bar. Before a
// release run `FULL_E2E=1 npm run test:e2e` to get the full desktop × mobile
// matrix (Firefox still only runs its tagged test).
const fullMatrix = process.env.FULL_E2E === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
      grepInvert: /@mobile|@firefox/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      grep: fullMatrix ? undefined : /@both|@mobile/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      grep: /@firefox/,
    },
  ],
  webServer: [
    {
      command: 'node scripts/mock-server.mjs',
      port: 4545,
      reuseExistingServer: true,
      timeout: 20_000,
    },
    {
      command: 'npx serve dist -s -l 4174',
      port: 4174,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
