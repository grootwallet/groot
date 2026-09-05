import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const unlockRoute = readFileSync(
  new URL('../../routes/unlock/+page.svelte', import.meta.url),
  'utf8'
).replace(/\s+/g, ' ');
const appShell = readFileSync(
  new URL('../components/AppShell.svelte', import.meta.url),
  'utf8'
).replace(/\s+/g, ' ');

describe('locked wallet profile switching', () => {
  it('clears wallet-scoped credentials and errors when the selected profile changes', () => {
    expect(unlockRoute).toContain(
      'const selectionChanged = selectedWalletId !== registry.selectedWalletId;'
    );
    expect(unlockRoute).toContain("if (selectionChanged) { credential = ''; error = '';");
    expect(unlockRoute).toContain("error = ''; resetConfirmation = ''; showReset = false;");
  });

  it('keeps protected Bitcoin Core credentials off the locked screen', () => {
    expect(unlockRoute).not.toContain('Saved RPC URL');
    expect(unlockRoute).not.toContain('Saved RPC username');
    expect(unlockRoute).not.toContain('admitMainnetCore');
    expect(unlockRoute).toContain('await walletService.unlock(credential)');
  });

  it('uses the existing network identity without a global mainnet banner', () => {
    expect(appShell).not.toContain('MAINNET · REAL BITCOIN');
    expect(appShell).not.toContain('mainnet-banner');
  });
});
