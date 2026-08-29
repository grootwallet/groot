import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./TxDetailsModal.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('transaction details denomination', () => {
  it('switches the hero amount between sats and BTC like the overview balance', () => {
    expect(component).toContain(
      "import { denomination, setDenomination } from '$lib/denomination'"
    );
    expect(component).toContain('class="detail-amount"');
    expect(component).toContain("class:replaced={transaction.status === 'replaced'}");
    expect(component).toContain("setDenomination($denomination === 'btc' ? 'sats' : 'btc')");
    expect(component).toContain('Show transaction amount in sats');
    expect(component).toContain('Show transaction amount in BTC');
  });

  it('keeps a visible keyboard focus treatment on the amount control', () => {
    expect(appCss).toMatch(/\.detail-hero \.detail-amount:focus-visible\s*\{/);
    expect(appCss).toMatch(/\.detail-hero \.detail-amount\.replaced\s*\{/);
  });
});
