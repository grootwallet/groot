import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const welcome = readFileSync(new URL('../../routes/welcome/+page.svelte', import.meta.url), 'utf8');

describe('software-wallet onboarding security copy', () => {
  it('keeps one concise required acknowledgement on the protection step', () => {
    expect(welcome).toContain('Keep it with your backup.');
    expect(welcome).toContain('I understand this exact passphrase is required with my 24 words.');
    expect(welcome).not.toContain(
      'Anyone with a copied profile can guess this passphrase offline.'
    );
    expect(welcome).not.toContain('Backup not verified yet');
    expect(welcome).not.toContain('Choose a memorable, unique passphrase.');
    expect(welcome).not.toContain('A unique passphrase keeps a copied profile harder to guess.');
  });
});
