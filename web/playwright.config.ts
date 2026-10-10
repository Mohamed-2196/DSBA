// End-to-end suite: the app as students, a student rep and an admin use it, against a running stack.
//
//   cd web && npx playwright test                 everything (about 5 one-time codes per run, see e2e/README in the report)
//   npx playwright test e2e/forum.spec.ts         one area (the setup project runs first: it signs the students up)
//   E2E_KEEP=1 npx playwright test                keep the run's accounts and posts for a look afterwards
//
// The setup project signs up two new students with real one-time codes (read from E2E_MAIL_DIR / E2E_SMS_DIR)
// and gets the rep and admin sessions with dev-login; the specs use those sessions; the teardown deletes the two
// accounts and cleans up what the run created. Settings: see e2e/support.ts.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { env } from './e2e/support';

// Use the runner's own browsers when it has them (PLAYWRIGHT_BROWSERS_PATH); otherwise the machine's Chromium.
const chromium = process.env.E2E_CHROMIUM ?? '/opt/pw-browsers/chromium';
const executablePath = !process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(chromium) ? chromium : undefined;

export default defineConfig({
  testDir: './e2e',
  outputDir: path.join(env.stateDir, 'test-results'),
  // One worker: the specs share a few accounts (a suspension or a role change must not race other tests), and
  // the machine is shared.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: path.join(env.stateDir, 'report') }]] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: env.baseURL,
    viewport: { width: 1366, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Asia/Bahrain',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/, teardown: 'cleanup' },
    { name: 'cleanup', testMatch: /.*\.teardown\.ts/ },
    { name: 'app', testMatch: /.*\.spec\.ts/, dependencies: ['setup'] },
  ],
});
