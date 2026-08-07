import { parseTimestamp } from '$lib/date-time';
import type { Transaction } from '$lib/types';
import type { Sats, WalletSnapshot } from './contracts';

/** Pending funds include both trusted change and untrusted incoming mempool outputs. */
export function pendingBalance(balance: WalletSnapshot['balance']): Sats {
  const explicitPending = Number(balance.pending);
  if (Number.isSafeInteger(explicitPending) && explicitPending >= 0) {
    return explicitPending as Sats;
  }

  // Compatibility for snapshots persisted before the pending field was added.
  return Math.max(0, Number(balance.total) - Number(balance.confirmed)) as Sats;
}

/** Keep transaction ordering deterministic even when several entries share a timestamp. */
export function sortTransactionsNewestFirst(items: readonly Transaction[]): Transaction[] {
  return items
    .map((transaction, index) => ({
      transaction,
      index,
      timestamp: parseTimestamp(transaction.date)?.getTime() ?? Number.NEGATIVE_INFINITY
    }))
    .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index)
    .map(({ transaction }) => transaction);
}
