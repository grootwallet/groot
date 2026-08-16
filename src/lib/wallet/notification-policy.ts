import type { WalletEvent } from './contracts';

export function coalesceNotificationEvents(events: WalletEvent[]): WalletEvent[] {
  const receipts = new Set(
    events
      .filter(
        (event): event is Extract<WalletEvent, { type: 'payment_received' }> =>
          event.type === 'payment_received'
      )
      .map((event) => event.txid)
  );
  const confirmations = new Map(
    events
      .filter(
        (event): event is Extract<WalletEvent, { type: 'first_confirmation' }> =>
          event.type === 'first_confirmation'
      )
      .map((event) => [event.txid, event])
  );
  const result: WalletEvent[] = [];

  for (const event of events) {
    if (event.type === 'payment_received' && confirmations.has(event.txid)) {
      result.push({
        type: 'payment_received_confirmed',
        txid: event.txid,
        amount: event.amount,
        balance: confirmations.get(event.txid)!.balance
      });
      continue;
    }
    if (event.type === 'first_confirmation' && receipts.has(event.txid)) continue;
    result.push(event);
  }

  return result;
}
