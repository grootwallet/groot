import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const multisigSetup = readFileSync(
  new URL('../../routes/multisig/new/+page.svelte', import.meta.url),
  'utf8'
);

describe('Coldcard policy transfer copy', () => {
  it('names both supported destinations before the on-device import step', () => {
    expect(multisigSetup).toContain('Save the policy to microSD or Coldcard Virtual Disk.');
    expect(multisigSetup).toContain('Settings → Multisig Wallets → Import');
  });
});
