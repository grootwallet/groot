import { describe, expect, it } from 'vitest';
import { sats, type WalletEvent } from './contracts';
import { coalesceNotificationEvents, walletEventPresentation } from './notification-policy';

describe('wallet notification presentation', () => {
  it('combines a newly discovered confirmed receipt into one event', () => {
    const events: WalletEvent[] = [
      { type: 'payment_received', txid: 'received', amount: sats(8_000), balance: sats(8_000) },
      { type: 'first_confirmation', txid: 'received', balance: sats(8_000) }
    ];
    expect(coalesceNotificationEvents(events)).toEqual([
      {
        type: 'payment_received_confirmed',
        txid: 'received',
        amount: sats(8_000),
        balance: sats(8_000)
      }
    ]);
  });

  it('keeps independently delivered confirmations and unrelated transactions', () => {
    const events: WalletEvent[] = [
      { type: 'payment_received', txid: 'new', amount: sats(2_000), balance: sats(10_000) },
      { type: 'first_confirmation', txid: 'older', balance: sats(10_000) }
    ];
    expect(coalesceNotificationEvents(events)).toEqual(events);
  });

  it('combines paired events regardless of persisted delivery order', () => {
    const events: WalletEvent[] = [
      { type: 'first_confirmation', txid: 'received', balance: sats(8_000) },
      { type: 'payment_received', txid: 'received', amount: sats(8_000), balance: sats(8_000) }
    ];
    expect(coalesceNotificationEvents(events)).toEqual([
      {
        type: 'payment_received_confirmed',
        txid: 'received',
        amount: sats(8_000),
        balance: sats(8_000)
      }
    ]);
  });

  it('presents amount events with the selected denomination and unchanged success semantics', () => {
    expect(
      walletEventPresentation(
        { type: 'payment_received', txid: 'received', amount: sats(8_000), balance: sats(10_000) },
        'en',
        'sats',
        () => {}
      )
    ).toEqual({
      title: 'Bitcoin received',
      description: 'Received 8,000 sats · Balance 10,000 sats',
      tone: 'success'
    });
    expect(
      walletEventPresentation(
        { type: 'transaction_broadcast', txid: 'sent', balance: sats(100_000_000) },
        'en',
        'btc',
        () => {}
      )
    ).toEqual({
      title: 'Transaction broadcast',
      description: 'Remaining wallet balance: 1.00000000 BTC',
      tone: 'success'
    });
  });

  it('keeps policy actions bound to the exact encoded coin', async () => {
    let destination = '';
    const presentation = walletEventPresentation(
      {
        type: 'policy_mature',
        outpoint: 'tx/id:1',
        policyType: 'recovery'
      },
      'en',
      'sats',
      (href) => {
        destination = href;
      }
    );
    expect(presentation?.title).toBe('Recovery key can now spend a coin');
    await presentation?.action?.run();
    expect(destination).toBe('/coins?coin=tx%2Fid%3A1');
  });
});
