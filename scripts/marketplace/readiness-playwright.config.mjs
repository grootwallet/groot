import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.GROOT_READINESS_PORT);
const browser = process.env.GROOT_READINESS_BROWSER;
if (browser !== 'chromium' && browser !== 'webkit')
  throw new Error('Select an installed acceptance engine explicitly.');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('The acceptance configuration requires an owned loopback server.');
}
if (!process.env.GROOT_READINESS_JSON || !process.env.GROOT_READINESS_RESULTS) {
  throw new Error('The acceptance configuration requires a unique evidence directory.');
}

// No webServer here: the runner starts, identifies and stops its own server.
export default defineConfig({
  testDir: fileURLToPath(new URL('../../e2e', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  maxFailures: 1,
  timeout: 30_000,
  globalTimeout: 10 * 60_000,
  outputDir: process.env.GROOT_READINESS_RESULTS,
  globalSetup: fileURLToPath(new URL('./readiness-browser-setup.mjs', import.meta.url)),
  reporter: [['list'], ['json', { outputFile: process.env.GROOT_READINESS_JSON }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: browser,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices[browser === 'webkit' ? 'Desktop Safari' : 'Desktop Chrome'],
        browserName: browser,
        viewport: { width: 1180, height: 780 }
      }
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: browser, viewport: { width: 390, height: 844 } }
    }
  ]
});
