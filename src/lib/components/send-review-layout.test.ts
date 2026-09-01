import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);

describe('send review layout', () => {
  it('keeps wrapped permanent labels clear of review separators', () => {
    expect(singleSend.match(/class="label-details-row"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(multisigSend).toContain('class="label-details-row"');
    expect(appCss).toMatch(/\.details-list > \.label-details-row\s*\{[^}]*padding-block: 8px/s);
    expect(appCss).toMatch(
      /\.details-list > \.label-details-row \.permanent-label-tags\s*\{[^}]*justify-content: flex-end/s
    );
  });

  it('aligns proposal progress beside the resume action without squeezing labels', () => {
    expect(overview).toContain('class="active-proposal-progress"');
    expect(overview).toContain('class="active-proposal-copy active-payment-copy"');
    expect(overview).toContain(
      '<small class="active-proposal-progress">{proposalProgress}</small>'
    );
    expect(appCss).toMatch(
      /\.active-payment-copy\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/s
    );
    expect(appCss).toMatch(/\.active-proposal-meta\s*\{[^}]*padding-top: 4px/s);
  });

  it('lets every primary single-key and multisig review toggle denomination', () => {
    expect(singleSend.match(/<TransactionReviewDetails[\s\S]*?interactiveAmounts/g)?.length).toBe(
      4
    );
    expect(singleSend.match(/<Amount value=\{proposal\.amount\} interactive \/>/g)?.length).toBe(4);
    expect(multisigSend).toContain('<Amount value={Number(proposal.amount)} interactive />');
    expect(multisigSend.match(/<TransactionReviewDetails[\s\S]*?interactiveAmounts/g)?.length).toBe(
      2
    );
  });

  it('makes both send amount-field units accessible denomination toggles', () => {
    for (const route of [singleSend, multisigSend]) {
      expect(route).toContain('class="amount-unit-toggle"');
      expect(route).toContain('onclick={toggleAmountInputDenomination}');
      expect(route).toContain("? 'Show transaction amount in sats'");
      expect(route).toContain(": 'Show transaction amount in BTC'");
    }
    expect(appCss).toMatch(/\.amount-input \.amount-unit-toggle\s*\{/);
  });

  it('bounds long BTC values inside self-transfer summaries', () => {
    expect(appCss).toMatch(
      /\.self-transfer-consolidating\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 42%\)/s
    );
    expect(appCss).toMatch(
      /\.self-transfer-consolidating > :last-child\s*\{[^}]*max-width: 100%[^}]*white-space: nowrap/s
    );
  });
});
