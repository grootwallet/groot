import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const amount = readFileSync(new URL('./Amount.svelte', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);

describe('send review layout', () => {
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
