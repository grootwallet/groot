import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const tauriAdapter = readFileSync(new URL('./tauri.ts', import.meta.url), 'utf8');

describe('deferred backup re-presentation', () => {
  it.each([overview, settings])(
    'offers native re-presentation before the existing proof without exposing words',
    (route) => {
      expect(route).toContain('View recovery words first');
      expect(route).toContain('walletService.revealAndVerifyBackup(verifyCredential)');
      expect(route).toContain('Recovery words stay inside the trusted native window.');
    }
  );

  it('receives only native verification state over IPC', () => {
    expect(tauriAdapter).toContain(
      "command<boolean>('wallet_reveal_and_verify_backup', { credential })"
    );
    expect(tauriAdapter).not.toMatch(
      /command<[^>]*(?:Mnemonic|string)[^>]*>\('wallet_reveal_and_verify_backup'/
    );
  });
});
