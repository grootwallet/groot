import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./PermanentLabelTags.svelte', import.meta.url), 'utf8');
const coins = readFileSync(new URL('../../routes/coins/+page.svelte', import.meta.url), 'utf8');
const fixtures = readFileSync(new URL('../data.ts', import.meta.url), 'utf8');

describe('permanent label tags', () => {
  it('renders every unique authoritative label without deriving provenance in the UI', () => {
    expect(component).toContain('new Map(labels.map((label) => [label.id, label]))');
    expect(component).toContain('{#each uniqueLabels as label (label.id)}');
    expect(component).toContain("aria-label={translate($locale, 'Permanent labels')}");
    expect(component).not.toMatch(/sourceOutpoints|context ===|state ===/);
  });

  it('uses neutral copy instead of label text in discreet mode', () => {
    expect(component).toContain('{#if hidden}');
    expect(component).toContain('Labels hidden');
  });

  it('shows the complete provenance label set on each coin summary row', () => {
    expect(coins).toContain('<PermanentLabelTags labels={utxo.provenance.labels}');
    expect(coins).toContain('hidden={$discreetMode}');
    expect(coins).not.toContain('<strong>{coinName(utxo)}</strong>');
  });

  it('keeps a deterministic mixed-change fixture with two inherited labels', () => {
    expect(fixtures).toContain("state: 'mixed' as const");
    expect(fixtures).toContain('labels: [savings.label, refundLabel]');
    expect(fixtures).toContain("sourceOutpoints: ['f7c42c16...a1ec:0', 'c807a142...52ad:1']");
  });
});
