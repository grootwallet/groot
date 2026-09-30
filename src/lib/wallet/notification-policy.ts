import type { WalletEvent } from './contracts';
import { formatAmount, type Denomination } from '$lib/denomination';
import { translate } from '$lib/i18n-catalog';
import type { Locale } from '$lib/i18n';

export type WalletNotificationPresentation = {
  title: string;
  description?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  action?: { label: string; run: () => void | Promise<void> };
};

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

export function walletEventPresentation(
  event: WalletEvent,
  locale: Locale,
  denomination: Denomination,
  navigate: (href: string) => void | Promise<void>
): WalletNotificationPresentation | null {
  const unit = denomination === 'btc' ? 'BTC' : 'sats';
  switch (event.type) {
    case 'payment_received':
      return {
        title: 'Bitcoin received',
        description: translate(locale, 'Received {amount} {unit} · Balance {balance} {unit}', {
          amount: formatAmount(event.amount, denomination),
          balance: formatAmount(event.balance, denomination),
          unit
        }),
        tone: 'success'
      };
    case 'payment_received_confirmed':
      return {
        title: 'Bitcoin received',
        description: translate(
          locale,
          'Received {amount} {unit} · First confirmation · Balance {balance} {unit}',
          {
            amount: formatAmount(event.amount, denomination),
            balance: formatAmount(event.balance, denomination),
            unit
          }
        ),
        tone: 'success'
      };
    case 'first_confirmation':
      return {
        title: 'First confirmation',
        description: translate(locale, 'Transaction confirmed · Balance {balance} {unit}', {
          balance: formatAmount(event.balance, denomination),
          unit
        }),
        tone: 'success'
      };
    case 'transaction_broadcast':
      return {
        title: 'Transaction broadcast',
        description: translate(locale, 'Remaining wallet balance: {balance} {unit}', {
          balance: formatAmount(event.balance, denomination),
          unit
        }),
        tone: 'success'
      };
    case 'policy_approaching_maturity':
      return {
        title: translate(locale, '{key} available soon', {
          key: translate(locale, event.policyType === 'inheritance' ? 'Heir key' : 'Recovery key')
        }),
        description: translate(locale, '{count} blocks remain before it can spend one coin.', {
          count: event.remainingBlocks
        }),
        action: {
          label: translate(locale, 'View coin'),
          run: () => navigate(`/coins?coin=${encodeURIComponent(event.outpoint)}`)
        }
      };
    case 'policy_mature':
      return {
        title: translate(locale, '{key} can now spend a coin', {
          key: translate(locale, event.policyType === 'inheritance' ? 'Heir key' : 'Recovery key')
        }),
        description: translate(
          locale,
          'Your normal 2-of-3 keys still work. No action is required.'
        ),
        action: {
          label: translate(locale, 'View options'),
          run: () => navigate(`/coins?coin=${encodeURIComponent(event.outpoint)}`)
        }
      };
    case 'wallet_updated':
    case 'wallet_profile_updated':
      return null;
  }
}
