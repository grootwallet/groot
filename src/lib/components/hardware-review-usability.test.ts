import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const amount = readFileSync(new URL('./Amount.svelte', import.meta.url), 'utf8');
const details = readFileSync(new URL('./TransactionReviewDetails.svelte', import.meta.url), 'utf8');
const policy = readFileSync(new URL('./SignerPolicyReview.svelte', import.meta.url), 'utf8');
const recipientAddressModal = readFileSync(
  new URL('./RecipientAddressModal.svelte', import.meta.url),
  'utf8'
);
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);
const multisigSetup = readFileSync(
  new URL('../../routes/multisig/new/+page.svelte', import.meta.url),
  'utf8'
);

describe('hardware signing review usability', () => {
  it('lets every hardware-review amount toggle the global sats/BTC denomination', () => {
    expect(amount).toContain("setDenomination($denomination === 'sats' ? 'btc' : 'sats')");
    expect(amount).toContain('{#if interactive && !hidden}');
    expect(details).toContain('interactive={interactiveAmounts}');
    for (const source of [singleSend, multisigSend]) {
      expect(source).toMatch(/<Amount value=\{(?:Number\()?proposal\.fee\)?\} interactive \/>/);
      expect(source).toContain('interactiveAmounts');
    }
  });

  it('keeps the Ledger policy and transaction reviews as explicit reachable steps', () => {
    expect(policy).toContain("'Step 1 of 2 · Wallet policy'");
    expect(policy).toContain("'Wallet policy reviewed — show transaction'");
    expect(policy).toContain("'Review & sign on {device}'");
    expect(multisigSend).toContain("'Step 2 of 2 · Transaction review'");
    expect(multisigSend).toContain('showTransactionDuringSigning()');
  });

  it('keeps the Ledger policy modal compact without removing trusted-display checks', () => {
    expect(policy).not.toContain("'Compare every signer key and the first address on Ledger.'");
    expect(policy).toContain("'Signer keys to compare'");
    expect(policy).toContain("'First address reference'");
    expect(policy).toContain('showAddressReference = true');
    expect(multisigSend).toContain(
      "showAddressReference={policyRegistrationProfile(signer).kind !== 'ledger'}"
    );
    expect(multisigSetup).toContain('<SignerPolicyReview');
    expect(multisigSetup).not.toContain('showAddressReference=');
    expect(policy).not.toContain(
      "Groot's current Ledger connection must authorize this policy again for each signing"
    );
    expect(multisigSend).not.toContain(
      "description={translate($locale, 'Check the policy, signer keys, and first address.')}"
    );
  });

  it('starts with a compact first-address reference and expands on request', () => {
    expect(policy).toContain('let addressExpanded = $state(false)');
    expect(policy).toContain('<code>{compactAddress(displayedAddress)}</code>');
    expect(policy).toContain('aria-expanded={addressExpanded}');
    expect(policy).toContain('{#if addressExpanded}<ReadableAddress');
  });

  it('does not repeat address-comparison guidance in the hardware address modal', () => {
    expect(recipientAddressModal).not.toContain('The brighter first and last groups');
    expect(recipientAddressModal).not.toContain('status-dot');
    expect(recipientAddressModal).not.toContain('{detail}');
    for (const source of [singleSend, multisigSend]) {
      const hardwareAddressStart = source.indexOf('open={hardwareAddressOpen}');
      const hardwareAddressEnd = source.indexOf('/>', hardwareAddressStart);
      const hardwareAddressModal = source.slice(hardwareAddressStart, hardwareAddressEnd);
      expect(hardwareAddressModal).toContain('description=""');
      expect(hardwareAddressModal).toContain('detail=""');
    }
  });

  it('does not offer QR transfer controls to a directly connected Ledger signer', () => {
    expect(singleSend).toContain('!/ledger/i.test(hardwareSignerIdentity)');
    expect(singleSend).toContain('{#if hardwareQrTransferAvailable}');
  });

  it('does not place a decorative divider above hardware review details', () => {
    expect(appCss).toMatch(/\.hardware-review-details\s*\{[^}]*border-top:\s*0;/s);
  });

  it('uses the main review hierarchy and separators in compact hardware review', () => {
    for (const source of [singleSend, multisigSend]) {
      const start = source.indexOf('class="hardware-review"');
      const end = source.indexOf('<TransactionReviewDetails', start);
      const review = source.slice(start, end);
      expect(review).toContain('class="hardware-review-amount"');
      expect(review).toContain('class="details-list hardware-review-primary"');
      expect(review.indexOf("'To'")).toBeLessThan(review.indexOf("'Label'"));
      expect(review.indexOf("'Label'")).toBeLessThan(review.indexOf("'Network'"));
      expect(review.indexOf("'Network'")).toBeLessThan(review.indexOf("'Network fee'"));
      expect(review.indexOf("'Network fee'")).toBeLessThan(review.indexOf("'Total'"));
    }
    expect(details).toContain('<dl class="details-list">');
    expect(appCss).toMatch(
      /\.hardware-review \.details-list > div\s*\{[^}]*min-height: 43px;[^}]*gap: 18px;/s
    );
  });

  it('marks wallet-owned recipients and shows their Rust-derived receive paths', () => {
    expect(details).toContain('proposal.recipientIsWalletOwned');
    expect(details).toContain("'Self-transfer'");
    expect(details).toContain('proposal.walletControlledOutputAmount != null');
    expect(details).toContain("'Consolidating'");
    expect(details).toContain(
      '<Amount value={proposal.walletControlledOutputAmount} interactive={interactiveAmounts} />'
    );
    expect(details).toContain('proposal.recipientDerivationPaths');
    expect(details).toContain("'Receive path'");
    for (const source of [singleSend, multisigSend]) {
      const start = source.indexOf('class="hardware-review"');
      const end = source.indexOf('<TransactionReviewDetails', start);
      expect(source.slice(start, end)).toContain("translate($locale, 'To')");
    }
  });

  it('checks the wallet session before hardware discovery and routes an expired session to unlock', () => {
    for (const source of [singleSend, multisigSend]) {
      expect(source).toContain('if ((await walletService.session()).unlocked) return true');
      expect(source).toContain("cause.code !== 'wallet_locked'");
      expect(source).toContain("await goto('/unlock')");
      expect(source).toContain('if (!(await hardwareSessionIsUnlocked())) return');
    }
  });

  it('defers automatic lock only while an actual hardware transaction review is pending', () => {
    for (const source of [singleSend, multisigSend]) {
      expect(source).toContain('const releaseHardwareReview = walletShell.beginHardwareReview()');
      expect(source).toContain('releaseHardwareReview()');
    }
  });
});
