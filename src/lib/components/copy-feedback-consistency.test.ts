import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const singleReceive = readFileSync(
  new URL('../../routes/receive/+page.svelte', import.meta.url),
  'utf8'
);
const multisigReceive = readFileSync(
  new URL('../../routes/multisig/receive/+page.svelte', import.meta.url),
  'utf8'
);
const readableAddress = readFileSync(new URL('./ReadableAddress.svelte', import.meta.url), 'utf8');
const readableIdentifier = readFileSync(
  new URL('./ReadableIdentifier.svelte', import.meta.url),
  'utf8'
);

describe('copy feedback consistency', () => {
  it('shows a temporary check icon when a discard-modal address is copied', () => {
    expect(readableAddress).toContain('{#if copied}<Check');
    expect(readableIdentifier).toContain('{#if copied}<Check');

    for (const source of [singleReceive, multisigReceive]) {
      expect(source).toContain('let discardAddressCopied = $state(false)');
      expect(source).toContain('discardAddressCopied = true');
      expect(source).toContain('copied={discardAddressCopied}');
      expect(source).toContain('setTimeout(() => (discardAddressCopied = false), 1500)');
    }
  });

  it('keeps the discard disclosure visually quiet and protocol text case-exact', () => {
    expect(appCss).toMatch(
      /\.discard-address-detail \.verification-details\[open\] summary\s*\{[^}]*border-bottom:\s*0;/s
    );
    expect(appCss).toMatch(/\.address-detail-view dd code\s*\{[^}]*text-transform:\s*none;/s);
  });
});
