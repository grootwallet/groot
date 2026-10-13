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

  it('clears failed progress instead of reloading a stale scan range', () => {
    const failure = settings.indexOf(
      "scanError = localizedError(cause, $locale, 'The full rescan failed.');"
    );
    const reset = settings.indexOf('scanStatus = idleScanStatus();', failure);
    const progressCondition = settings.indexOf(
      "{#if scanning || scanStatus.status === 'cancelling'}"
    );

    expect(failure).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(failure);
    expect(progressCondition).toBeGreaterThan(-1);
    expect(settings).not.toContain("['cancelling', 'cancelled', 'interrupted', 'failed']");
  });

  it('replaces the previous completed range before starting and ignores stale terminal polls', () => {
    const start = settings.indexOf('async function runFullRescan()');
    const reset = settings.indexOf('scanStatus = runningScanStatus({', start);
    const command = settings.indexOf('walletService.fullRescan(scanCredential)', reset);
    const poll = settings.indexOf("status.status === 'running' || status.status === 'cancelling'");

    expect(reset).toBeGreaterThan(start);
    expect(command).toBeGreaterThan(reset);
    expect(poll).toBeGreaterThan(command);
  });
});
