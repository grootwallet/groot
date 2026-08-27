import { describe, expect, it } from 'vitest';
import { DummyWalletAdapter } from './dummy';

describe('payment drafts', () => {
  it('keeps unfinished payment intent isolated by wallet and returns defensive copies', async () => {
    const adapter = new DummyWalletAdapter();
    const registry = await adapter.profiles();
    const walletId = registry.selectedWalletId;
    expect(walletId).toBeTruthy();

    await adapter.savePaymentDraft({
      kind: 'multisig',
      walletId: walletId!,
      address: 'tb1qrecipient',
      labels: ['Hardware certification'],
      amount: '',
      stage: 2,
      selectedCoins: [],
      automaticStrategy: 'balanced',
      selectedRate: 1
    });

    const firstRead = await adapter.paymentDraft();
    expect(firstRead).toMatchObject({
      kind: 'multisig',
      address: 'tb1qrecipient',
      labels: ['Hardware certification'],
      stage: 2
    });
    firstRead?.labels.push('mutated');
    expect((await adapter.paymentDraft())?.labels).toEqual(['Hardware certification']);

    await adapter.clearPaymentDraft();
    expect(await adapter.paymentDraft()).toBeNull();
  });
});
