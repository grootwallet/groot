import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const singleKeySend = readFileSync(
  new URL('../../routes/send/+page.svelte', import.meta.url),
  'utf8'
);
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);

describe('send review amount contrast', () => {
  it('uses primary text for the amount and unit in every send review flow', () => {
    expect(singleKeySend).toContain('class="review-amount"');
    expect(multisigSend).toContain('class="review-amount"');
    expect(appCss).toMatch(/\.review-amount strong\s*\{[^}]*color: var\(--text\)/s);
    expect(appCss).toMatch(/\.review-amount small\s*\{[^}]*color: var\(--text\)/s);
  });
});
