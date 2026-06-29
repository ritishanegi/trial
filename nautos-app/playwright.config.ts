import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 * See: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './playwright/tests',
  outputDir: './playwright-report/results',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry failed tests once on CI to reduce flakiness */
  retries: process.env.CI ? 1 : 0,

  /* Limit parallelism on CI to avoid resource contention */
  workers: process.env.CI ? 2 : undefined,

  /* Reporter: HTML for local dev, list for CI */
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['html', { open: 'on-failure' }]],

  /* Global test settings */
  use: {
    baseURL: 'http://localhost:3000',

    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on retry */
    video: 'on-first-retry',

    /* Collect traces for failed tests */
    trace: 'on-first-retry',

    /* Reasonable timeouts */
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  /* Projects: chromium primary, firefox secondary */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  /* Automatically start the Next.js dev server before running tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
