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

describe('send frozen-balance guidance', () => {
  for (const [name, source] of [
    ['single-key', singleKeySend],
    ['multisig', multisigSend]
  ] as const) {
    it(`explains frozen funds and links ${name} sends to coin management`, () => {
      expect(source).toContain('const frozenAmount = $derived(');
      expect(source).toContain('{#if frozenAmount > 0}');
      expect(source).toContain('<Amount value={frozenAmount} hidden={$discreetMode} />');
      expect(source).toContain('class="frozen-balance-guidance"');
      expect(source).toContain('<a href="/coins"');
      expect(source).toContain("translate($locale, 'Review frozen coins')");
    });
  }

  it('presents the recovery action as an accessible blue text link', () => {
    expect(appCss).toMatch(/\.frozen-balance-guidance a\s*\{[^}]*color: var\(--link\)/s);
    expect(appCss).toMatch(/\.frozen-balance-guidance a:focus-visible\s*\{/s);
  });
});
