import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const unlockRoute = readFileSync(
  new URL('../../routes/unlock/+page.svelte', import.meta.url),
  'utf8'
).replace(/\s+/g, ' ');

describe('locked wallet profile switching', () => {
  it('clears wallet-scoped credentials and errors when the selected profile changes', () => {
    expect(unlockRoute).toContain(
      'const selectionChanged = selectedWalletId !== registry.selectedWalletId;'
    );
    expect(unlockRoute).toContain("if (selectionChanged) { credential = ''; corePassword = '';");
    expect(unlockRoute).toContain("error = ''; resetConfirmation = ''; showReset = false;");
  });
});
