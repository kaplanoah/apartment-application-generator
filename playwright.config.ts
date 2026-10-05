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
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { acceptDownloads: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: LAPTOP } },
    ...(withWebKit ? [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: LAPTOP } }] : []),
  ],
});
