import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const amount = readFileSync(new URL('./Amount.svelte', import.meta.url), 'utf8');
const details = readFileSync(new URL('./TransactionReviewDetails.svelte', import.meta.url), 'utf8');
const policy = readFileSync(new URL('./SignerPolicyReview.svelte', import.meta.url), 'utf8');
const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
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
    expect(multisigSend).toContain("'Step 2 of 2 · Transaction review'");
    expect(multisigSend).toContain('showTransactionDuringSigning()');
  });

  it('starts with a compact first-address reference and expands on request', () => {
    expect(policy).toContain('let addressExpanded = $state(false)');
    expect(policy).toContain('<code>{compactAddress(displayedAddress)}</code>');
    expect(policy).toContain('aria-expanded={addressExpanded}');
    expect(policy).toContain('{#if addressExpanded}<ReadableAddress');
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
      expect(source).toContain("proposal.recipientIsWalletOwned ? 'Self-transfer recipient'");
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
