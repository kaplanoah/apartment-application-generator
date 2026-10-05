import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests open the built single file from disk (file://), exactly
 * as people will. Run `npm run test:e2e`, which builds first. WebKit (Safari's
 * engine) runs in CI, or locally with E2E_WEBKIT=1 once installed.
 */
const withWebKit = Boolean(process.env.CI || process.env.E2E_WEBKIT);
/** A typical laptop window, so drag targets are on screen without scrolling. */
const LAPTOP = { width: 1440, height: 900 };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  // Each test stands alone, so tests in one file run side by side too.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    // A stuck click or fill fails on its own, with a log of what it waited for, well before
    // the test's timeout cuts it off without one.
    actionTimeout: 10_000,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: LAPTOP } },
    ...(withWebKit
      ? [
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], viewport: LAPTOP },
            // On CI machines, one WebKit building a large packet can stall another
            // running beside it until a small test times out; one at a time is reliable.
            workers: 1,
          },
        ]
      : []),
  ],
});
