import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const welcome = readFileSync(new URL('../../routes/welcome/+page.svelte', import.meta.url), 'utf8');

describe('software-wallet onboarding security copy', () => {
  it('keeps copied-profile guidance brief and constructive', () => {
    expect(welcome).toContain('A unique passphrase keeps a copied profile harder to guess.');
    expect(welcome).toContain('Keep it with your recovery words.');
    expect(welcome).toContain('Choose a memorable, unique passphrase.');
  });
});
