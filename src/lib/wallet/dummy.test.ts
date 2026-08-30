import { describe, expect, it } from 'vitest';
import { DummyWalletAdapter } from './dummy';
import { feeRate, sats, type MultisigSetupDraft } from './contracts';

const pendingTransactionId = '6a1b2c3d4e5f67890123456789abcdef6a1b2c3d4e5f67890123456789abcdef';

describe('dummy acceleration proposals', () => {
  it('resumes one active proposal for the same transaction and method', async () => {
    const adapter = new DummyWalletAdapter();
    const first = await adapter.prepareAcceleration(pendingTransactionId, 'rbf', feeRate(12));
    const resumed = await adapter.prepareAcceleration(pendingTransactionId, 'rbf', feeRate(12));
    const cpfp = await adapter.prepareAcceleration(pendingTransactionId, 'cpfp', feeRate(12));

    expect(resumed).toEqual(first);
    expect(cpfp.proposalId).not.toBe(first.proposalId);
  });

  it('keeps a 2.5 sat/vB target distinct from its whole-satoshi effective rate', async () => {
    const adapter = new DummyWalletAdapter();
    const quote = await adapter.quoteRbf(pendingTransactionId, feeRate(2.5));

    expect(quote.targetFeeRate).toBe(2.5);
    expect(quote.estimatedReplacementFee).toBe(380);
    expect(quote.resultingEffectiveFeeRate).toBe(2.5);
    expect(quote.recommendationSource).toBe('custom');
  });

  it('opens with a deterministic replacement-only default above the exact minimum', async () => {
    const adapter = new DummyWalletAdapter();
    const quote = await adapter.quoteRbf(pendingTransactionId);

    expect(quote.targetFeeRate).toBeGreaterThan(quote.minimumFeeRate);
    expect(quote.recommendationSource).toBe('replacement_fallback');
  });

  it('quotes a CPFP package target and makes the child fee the additional cost', async () => {
    const adapter = new DummyWalletAdapter();
    const quote = await adapter.quoteCpfp(pendingTransactionId, feeRate(7));
    const proposal = await adapter.prepareAcceleration(pendingTransactionId, 'cpfp', feeRate(7));

    expect(quote.targetFeeRate).toBe(7);
    expect(quote.resultingPackageFeeRate).toBeGreaterThanOrEqual(quote.targetFeeRate);
    expect(proposal.acceleration).toMatchObject({
      method: 'cpfp',
      targetFeeRate: 7,
      incrementalFee: quote.childFee
    });
    expect(proposal.fee).toBe(quote.childFee);
  });
});

describe('software payment proposals', () => {
  it('lists and explicitly cancels a prepared payment', async () => {
    const adapter = new DummyWalletAdapter();
    const proposal = await adapter.preparePayment(
      'tb1qreceiver000000000000000000000000000000000',
      ['Saved software payment'],
      sats(1_000),
      feeRate(3)
    );

    expect(await adapter.paymentProposals()).toEqual([proposal]);
    await adapter.cancelPaymentProposal(proposal.proposalId);
    expect(await adapter.paymentProposals()).toEqual([]);
  });

  it('exposes a wallet-controlled output total only for a wallet-owned recipient', async () => {
    const adapter = new DummyWalletAdapter();
    const internal = await adapter.createAddress(['Internal destination']);
    const selfTransfer = await adapter.preparePayment(
      internal.address,
      ['Self-transfer fixture'],
      sats(3_000),
      feeRate(1)
    );
    const external = await adapter.preparePayment(
      'tb1qreceiver000000000000000000000000000000000',
      ['External fixture'],
      sats(3_000),
      feeRate(1)
    );

    expect(selfTransfer.recipientIsWalletOwned).toBe(true);
    expect(selfTransfer.walletControlledOutputAmount).toBe(3_000);
    expect(external.recipientIsWalletOwned).toBe(false);
    expect(external.walletControlledOutputAmount).toBeNull();
  });
});

describe('deferred backup verification', () => {
  it('requires 16 characters only for newly created software wallets', async () => {
    const adapter = new DummyWalletAdapter();

    await expect(adapter.createWallet('Too short', 'abcdefghijklmno', true)).rejects.toMatchObject({
      code: 'invalid_credential'
    });
    await expect(adapter.createWallet('Letters only', 'abcdefghijklmnop', true)).resolves.toBe(
      undefined
    );
  });

  it('keeps re-presentation secret-free and marks the fixture verified only after its proof', async () => {
    const adapter = new DummyWalletAdapter();
    await adapter.createWallet('Deferred backup', 'correct passphrase', false);

    expect((await adapter.session()).profile.backupVerified).toBe(false);
    expect(await adapter.revealAndVerifyBackup('correct passphrase')).toBe(true);
    expect((await adapter.session()).profile.backupVerified).toBe(true);
  });
});

describe('multisig setup drafts', () => {
  it('round-trips and explicitly discards public setup progress', async () => {
    const adapter = new DummyWalletAdapter();
    const draft: MultisigSetupDraft = {
      version: 1,
      stage: 'keys',
      templateKind: 'standard',
      standardRecipe: 'two_of_three',
      customCosignerCount: 3,
      name: 'Resume test',
      threshold: 2,
      cosigners: [],
      descriptorSaved: false,
      coldcardRegistered: false,
      policyVerificationDeferred: false,
      policyVerifications: [],
      updatedAt: 0
    };

    await adapter.saveMultisigSetupDraft(draft);
    expect(await adapter.multisigSetupDraft()).toMatchObject({
      stage: 'keys',
      name: 'Resume test'
    });
    await adapter.discardMultisigSetupDraft();
    expect(await adapter.multisigSetupDraft()).toBeNull();
  });
});
