import { describe, expect, it } from 'vitest';
import { DummyWalletAdapter } from './dummy';
import { feeRate, type MultisigSetupDraft } from './contracts';

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
    expect(await adapter.multisigSetupDraft()).toMatchObject({ stage: 'keys', name: 'Resume test' });
    await adapter.discardMultisigSetupDraft();
    expect(await adapter.multisigSetupDraft()).toBeNull();
  });
});
