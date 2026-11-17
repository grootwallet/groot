import { defineConfig } from '@playwright/test';
import base from '../readiness-playwright.config.mjs';

if (!process.env.GROOT_SANDBOX_TEST_PASSWORD || process.env.GROOT_MARKETPLACE_DEPLOYMENT !== '1')
  throw new Error('Use only the owned local TLS deployment verifier.');
export default defineConfig({
  ...base,
  testMatch: ['marketplace-backend.spec.ts', 'marketplace-deployment.spec.ts'],
  use: {
    ...base.use,
    baseURL: `https://127.0.0.1:${process.env.GROOT_READINESS_PORT}`,
    // Only this local verifier trusts its freshly generated self-signed certificate.
    ignoreHTTPSErrors: true,
    httpCredentials: { username: 'tester', password: process.env.GROOT_SANDBOX_TEST_PASSWORD }
  }
});
