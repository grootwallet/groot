import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);

describe('full rescan result presentation', () => {
  it('keeps the foreground rescan result authoritative over status polling', () => {
    const completion = settings.indexOf('const snapshot = await rescan;');
    const statusRead = settings.indexOf(
      'scanStatus = await walletService.recoveryScanStatus();',
      completion
    );
    const observationalCatch = settings.indexOf('A status refresh is observational.', statusRead);
    const close = settings.indexOf('scanOpen = false;', observationalCatch);
    const success = settings.indexOf("title: 'Full rescan complete'", close);

    expect(completion).toBeGreaterThan(-1);
    expect(statusRead).toBeGreaterThan(completion);
    expect(observationalCatch).toBeGreaterThan(statusRead);
    expect(close).toBeGreaterThan(observationalCatch);
    expect(success).toBeGreaterThan(close);
  });
});
