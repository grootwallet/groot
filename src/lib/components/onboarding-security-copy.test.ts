import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const welcome = readFileSync(new URL('../../routes/welcome/+page.svelte', import.meta.url), 'utf8');

describe('software-wallet onboarding security copy', () => {
  it('consolidates copied-profile guidance into the required acknowledgement', () => {
    expect(welcome).toContain('Keep a unique passphrase with your backup.');
    expect(welcome).toContain('Anyone with a copied profile can guess this passphrase offline.');
    expect(welcome).not.toContain('Choose a memorable, unique passphrase.');
    expect(welcome).not.toContain('A unique passphrase keeps a copied profile harder to guess.');
  });
});
