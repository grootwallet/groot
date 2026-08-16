import { describe, expect, it } from 'vitest';
import { sats, type WalletEvent } from './contracts';
import { coalesceNotificationEvents } from './notification-policy';

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
});
