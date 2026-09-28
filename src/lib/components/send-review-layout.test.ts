import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const amount = readFileSync(new URL('./Amount.svelte', import.meta.url), 'utf8');
const reviewDetails = readFileSync(
  new URL('./TransactionReviewDetails.svelte', import.meta.url),
  'utf8'
);
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);

describe('send review layout', () => {
  it('gives derivation paths breathable separated rows and aligns the input total', () => {
    expect(reviewDetails.match(/class="transaction-review-path-row"/g)?.length).toBe(3);
    expect(reviewDetails).toContain('class="transaction-review-input-total"');
    expect(appCss).toMatch(
      /\.details-list > \.transaction-review-path-row\s*\{[^}]*padding-block: 12px/s
    );
    expect(appCss).toMatch(
      /\.hardware-review-details > dl > \.transaction-review-path-row\s*\{[^}]*padding-block: 12px;/s
    );
    expect(reviewDetails).toContain('<dl class="details-list">');
    expect(appCss).toMatch(/\.transaction-review-input-total\s*\{[^}]*align-items: baseline;/s);
    expect(appCss).toMatch(/\.derivation-paths code\s*\{[^}]*font-size: 1em;/s);
  });

  it('coalesces manual coin previews while the amount changes in either send flow', () => {
    for (const source of [singleSend, multisigSend]) {
      expect(source).toContain('window.setTimeout(() => {');
      expect(source).toContain('}, 200);');
      expect(source).toContain('return () => window.clearTimeout(timer);');
    }
  });
  it('keeps the denomination separated from the amount', () => {
    expect(amount).toMatch(
      /\.formatted-amount\s*\{[^}]*display: inline-flex;[^}]*align-items: baseline;/s
    );
    expect(amount).toMatch(/\.formatted-amount\s*\{[^}]*gap: 0;/s);
    expect(amount).toMatch(/\.formatted-amount > small\s*\{[^}]*margin-inline-start: 0\.5rem;/s);
    expect(appCss).toMatch(/\.formatted-amount small\s*\{[^}]*margin-inline-start: 0\.5rem;/s);
    expect(appCss).toMatch(/\.review-amount\s*\{[^}]*align-items: center;/s);
    expect(appCss).toMatch(/\.review-amount > span\s*\{/s);
  });

  it('separates adjacent setup warnings', () => {
    expect(appCss).toMatch(
      /\.initial-history-scan \+ \.backup-verification-banner,[\s\S]*?\.sync-progress \+ \.backup-verification-banner\s*\{[^}]*margin-top: 0;/s
    );
    expect(appCss).not.toContain('.backup-unverified-note');
  });

  it('loads the authoritative selected profile before wallet-kind operations', () => {
    const registryRead = overview.indexOf('const registry = await walletService.profiles()');
    const proposalRead = overview.indexOf('walletService.paymentProposals()', registryRead);
    expect(registryRead).toBeGreaterThan(-1);
    expect(proposalRead).toBeGreaterThan(registryRead);
    expect(overview).not.toContain('const shellWallets = walletShell.profiles()');
  });

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
    expect(
      singleSend.match(/<Amount\s+value=\{proposal\.amount\}\s+interactive\s*\/>/g)?.length
    ).toBe(4);
    expect(multisigSend).toContain('<Amount value={Number(proposal.amount)} interactive />');
    expect(multisigSend.match(/<TransactionReviewDetails[\s\S]*?interactiveAmounts/g)?.length).toBe(
      2
    );
  });

  it('keeps funding privacy context inside optional review details', () => {
    expect(reviewDetails).toContain('class="transaction-review-funding"');
    expect(reviewDetails).toContain('labels={proposal.selectionImpact.fundingLabels}');
    expect(reviewDetails).toContain('hidden={$discreetMode}');
    expect(reviewDetails).not.toContain('new cluster link');
    expect(singleSend).not.toContain('class:warning={proposalHasPrivacyWarning}');
    expect(multisigSend).not.toContain('class:warning={proposalHasPrivacyWarning}');
  });

  it('keeps manual coin selection compact and directly interactive', () => {
    for (const route of [singleSend, multisigSend]) {
      expect(route).not.toContain("translate($locale, 'Funding labels')");
      expect(route).not.toContain("translate($locale, 'Input details')");
      expect(route).not.toContain('estimatedInputWeight');
    }
    expect(appCss).toMatch(/\.send-coin-picker label\s*\{[^}]*cursor: pointer;/s);
    expect(appCss).toMatch(
      /\.send-coin-picker label:not\(\.frozen\):hover,[\s\S]*?background: var\(--surface-hover\);/
    );
    expect(appCss).toMatch(/\.selection-recommendation > button\s*\{[^}]*font-weight: 500;/s);
    expect(appCss).toMatch(
      /\.automatic-strategies button\.active\s*\{[^}]*border-color: var\(--link\);[^}]*box-shadow: inset 0 0 0 1px var\(--link\);/s
    );
  });

  it('uses the signer sidebar throughout ordinary send steps', () => {
    for (const route of [singleSend, multisigSend]) {
      expect(route).toContain('class="send-flow-layout"');
      expect(route).toContain('class="signer-side-panel"');
      expect(route).toContain('class="send-stage-heading compact"');
    }
    expect(appCss).toMatch(
      /\.send-flow-layout\.with-signers\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 250px/s
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

  it('keeps RBF cost simple by default and moves rate controls behind disclosures', () => {
    for (const route of [singleSend, multisigSend]) {
      expect(route).toContain("'You will spend this much more'");
      expect(route).toContain('class="acceleration-default-choice"');
      expect(route).toContain('class="acceleration-optional-control"');
      expect(route).toContain("'Change fee rate'");
      expect(route).toContain("'View fee details'");
      expect(route).toContain("'Transaction accelerated'");
      expect(route).toContain('class="success-amount"');
      expect(route).toContain('variant="secondary" href="/activity"');
    }
    expect(appCss).toMatch(/\.success-state \.success-amount\s*\{[^}]*font-size: 24px/s);
  });

  it('shows an explicit fee-acceleration loading state before quote details are ready', () => {
    for (const route of [singleSend, multisigSend]) {
      expect(route).toContain('let accelerationLoading = $state(Boolean(initialAcceleration))');
      expect(route).toContain('class="form-card send-stage-card acceleration-loading-card"');
      expect(route).toContain("'Preparing fee acceleration'");
      expect(route).toContain(
        "'Reading the original transaction and current fee policy from Bitcoin Core.'"
      );
    }
    expect(appCss).toMatch(/\.acceleration-loading-card\s*\{[^}]*min-height: 260px/s);
    expect(appCss).toMatch(
      /\.send-signers\.loading::after\s*\{[^}]*skeleton-shimmer 1\.15s linear/s
    );
  });
});
