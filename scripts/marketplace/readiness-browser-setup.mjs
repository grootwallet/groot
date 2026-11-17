import { chromium, webkit } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// Playwright does not execute global setup during collection-only --list.
export default async function browserVersion() {
  const name = process.env.GROOT_READINESS_BROWSER;
  const path = process.env.GROOT_READINESS_VERSION;
  if ((name !== 'chromium' && name !== 'webkit') || !path)
    throw new Error('Missing browser evidence configuration.');
  const browser = await { chromium, webkit }[name].launch();
  try {
    writeFileSync(
      path,
      `${JSON.stringify({ name, version: browser.version(), evidence: 'Browser viewport emulation only; no native device certification.' })}\n`,
      { mode: 0o600 }
    );
  } finally {
    await browser.close();
  }
}
