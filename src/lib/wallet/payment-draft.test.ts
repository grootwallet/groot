import { describe, expect, it } from 'vitest';
import { clearPaymentDraft, paymentDraftFor, savePaymentDraft } from './payment-draft';

describe('payment drafts', () => {
  it('keeps unfinished payment intent isolated by wallet and returns defensive copies', () => {
    clearPaymentDraft('wallet-a');
    clearPaymentDraft('wallet-b');

    savePaymentDraft({
      kind: 'multisig',
      walletId: 'wallet-a',
      address: 'tb1qrecipient',
      labels: ['Hardware certification'],
      amount: '',
      stage: 2,
      selectedCoins: [],
      automaticStrategy: 'balanced',
      selectedRate: 1
    });

    const firstRead = paymentDraftFor('wallet-a');
    expect(firstRead).toMatchObject({
      kind: 'multisig',
      address: 'tb1qrecipient',
      labels: ['Hardware certification'],
      stage: 2
    });
    expect(paymentDraftFor('wallet-b')).toBeNull();

    firstRead?.labels.push('mutated');
    expect(paymentDraftFor('wallet-a')?.labels).toEqual(['Hardware certification']);

    clearPaymentDraft('wallet-a');
    expect(paymentDraftFor('wallet-a')).toBeNull();
  });
});
