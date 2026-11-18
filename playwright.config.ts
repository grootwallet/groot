import { defineConfig, devices } from '@playwright/test';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.E2E_PORT ?? '5188';
const baseURL = `http://127.0.0.1:${port}`;
const runtimeDir = join(realpathSync(tmpdir()), `groot-e2e-${port}-${process.pid}`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `pnpm exec vite --mode regtest --host 127.0.0.1 --port ${port}`,
    env: {
      GROOT_SVELTE_KIT_OUT_DIR: join(runtimeDir, 'svelte-kit'),
      GROOT_VITE_CACHE_DIR: join(runtimeDir, 'vite-cache')
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 780 } }
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } }
  ]
});
