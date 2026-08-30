import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const welcome = readFileSync(new URL('../../routes/welcome/+page.svelte', import.meta.url), 'utf8');

describe('software-wallet onboarding security copy', () => {
  it('warns that a copied encrypted profile permits offline guessing', () => {
    expect(welcome).toContain('Anyone with a copy of this encrypted profile');
    expect(welcome).toContain('lockout timer cannot protect a stolen copy');
    expect(welcome).toContain('Use a unique, long passphrase.');
  });
});
