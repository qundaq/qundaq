// Several specs call the app's own date formatters (shortDate, clockTime) directly in Node to build
// their expected strings, alongside `test.use({ timezoneId: 'Europe/Istanbul' })` for the browser
// context. Intl in Node reads the OS timezone unless TZ is set; GitHub Actions runners default to UTC,
// which would make the two sides disagree by the UTC+3 offset. Set before any spec or helper is loaded.
process.env.TZ = 'Europe/Istanbul';

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173/', serviceWorkers: 'allow' },
  snapshotPathTemplate: 'e2e/__screenshots__/{platform}/{arg}-{projectName}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide' } },
  projects: [
    { name: 'webkit', use: { ...devices['iPhone 13'], locale: 'tr-TR' } },
    { name: 'chromium', use: { ...devices['Pixel 7'], locale: 'tr-TR' } },
  ],
  // Tests always run against production builds so the CSP and service worker are active.
  webServer: [
    {
      command: 'npm run preview',
      url: 'http://localhost:4173/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    // Two builds (made by `npm run e2e:build-versions`) behind one URL, for e2e/update.spec.ts.
    {
      command: 'node e2e/support/two-build-server.mjs',
      url: 'http://localhost:4174/__health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
