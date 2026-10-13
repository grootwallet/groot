import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const send = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);
const styles = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('foreground wallet actions during sync', () => {
  it('keeps signer metadata visible and reports why the health action is unavailable', () => {
    expect(settings).toContain('hardwareSignerWallet = await walletService.externalSignerWallet()');
    expect(settings.indexOf('hardwareSignerWallet = await')).toBeLessThan(
      settings.indexOf('setHardwareHealthChecks(await walletService.hardwareHealthChecks())')
    );
    expect(settings).toContain('disabled={settingsSyncActive}');
    expect(settings).toContain("'Available after sync'");
    expect(settings).toContain('class="settings-sync-indicator"');
    const header = settings.slice(
      settings.indexOf('<header class="page-header">'),
      settings.indexOf('</header>', settings.indexOf('<header class="page-header">'))
    );
    expect(header.indexOf('</div>')).toBeLessThan(header.indexOf('settings-sync-indicator'));
  });

  it('renames display metadata without draining automatic sync first', () => {
    const rename = settings.slice(
      settings.indexOf('async function renameWallet()'),
      settings.indexOf('function openSignerRename()')
    );
    expect(rename).toContain('walletService.renameWallet(renameDraft)');
    expect(rename).not.toContain('pauseAutomaticSync');
  });

  it('presents signer backup as concise, static information', () => {
    expect(settings).toContain("? 'Signer backups'");
    expect(settings).toContain("? 'Completed when each signer was initialized.'");
    expect(settings).not.toContain("? 'Policy and signer recovery'");
    expect(styles).toMatch(/\.backup-information-row\s*\{\s*cursor: default;/);
    expect(styles).not.toMatch(/\.backup-information-row\s*\{[^}]*surface-inset/s);
  });

  it('stops automatic sync before preparing acceleration and enforces the signing countdown', () => {
    for (const flow of [send, multisigSend]) {
      expect(flow).toContain('walletShell.pauseAutomaticSync().then');
      expect(flow).toContain('if (accelerationSyncPaused) walletShell.resumeAutomaticSync()');
    }
    expect(send).toContain('disabled={!passphrase || retryAfterSeconds > 0}');
    expect(send).toContain("cause.code === 'rate_limited'");
  });

  it('pins the fee-rate suffix to the input edge', () => {
    expect(styles).toMatch(/\.amount-input\.fee-rate-input b\s*\{\s*right: 14px;/);
  });
});
