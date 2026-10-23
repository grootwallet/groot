import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '5196';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'maintenance-performance.spec.ts',
  workers: 1,
  timeout: 300_000,
  outputDir: '/tmp/groot-production-browser-measurements',
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 780 } }
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } }
  ]
});
