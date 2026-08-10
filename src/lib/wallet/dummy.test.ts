import { describe, expect, it } from 'vitest';
import { DummyWalletAdapter } from './dummy';
import { feeRate } from './contracts';

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
