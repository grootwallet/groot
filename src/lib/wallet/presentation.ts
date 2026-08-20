import { parseTimestamp } from '$lib/date-time';
import type { Transaction, Utxo } from '$lib/types';
import type { Sats, WalletSnapshot } from './contracts';

export type CoinSortOrder =
  'newest' | 'oldest' | 'largest' | 'smallest' | 'label-asc' | 'label-desc';

/** Pending funds include both trusted change and untrusted incoming mempool outputs. */
export function pendingBalance(balance: WalletSnapshot['balance']): Sats {
  const explicitPending = Number(balance.pending);
  if (Number.isSafeInteger(explicitPending) && explicitPending >= 0) {
    return explicitPending as Sats;
  }

  // Compatibility for snapshots persisted before the pending field was added.
  return Math.max(0, Number(balance.total) - Number(balance.confirmed)) as Sats;
}

export type PendingBalanceBreakdown = {
  incoming: Sats;
  change: Sats;
  outgoing: Sats;
};

/** Explain mempool state without presenting wallet-owned change as an incoming payment. */
export function pendingBalanceBreakdown(snapshot: WalletSnapshot): PendingBalanceBreakdown {
  const pending = Number(pendingBalance(snapshot.balance));
  const trustedPending = Number(snapshot.balance.trustedPending);
  const change = Number.isSafeInteger(trustedPending)
    ? Math.min(pending, Math.max(0, trustedPending))
    : 0;
  const outgoing = snapshot.transactions
    .filter((transaction) => transaction.status === 'pending' && transaction.direction === 'sent')
    .reduce(
      (total, transaction) => total + Number(transaction.amount) + Number(transaction.fee ?? 0),
      0
    );

  return {
    incoming: Math.max(0, pending - change) as Sats,
    change: change as Sats,
    outgoing: Math.max(0, outgoing) as Sats
  };
}

/** Keep transaction ordering deterministic even when several entries share a timestamp. */
export function sortTransactionsNewestFirst(items: readonly Transaction[]): Transaction[] {
  return items
    .map((transaction, index) => ({
      transaction,
      index,
      timestamp: parseTimestamp(transaction.date)?.getTime() ?? Number.NEGATIVE_INFINITY
    }))
    .sort(
      (left, right) =>
        comparePendingStatus(left.transaction, right.transaction, 'newest') ||
        right.timestamp - left.timestamp ||
        left.index - right.index
    )
    .map(({ transaction }) => transaction);
}

export type TransactionSortOrder = 'newest' | 'oldest' | 'largest' | 'smallest';

export function sortTransactions(
  items: readonly Transaction[],
  order: TransactionSortOrder = 'newest'
): Transaction[] {
  return items
    .map((transaction, index) => ({
      transaction,
      index,
      timestamp: parseTimestamp(transaction.date)?.getTime() ?? null
    }))
    .sort((left, right) => {
      let comparison = 0;
      if (order === 'newest' || order === 'oldest') {
        comparison =
          comparePendingStatus(left.transaction, right.transaction, order) ||
          compareTimestamp(left.timestamp, right.timestamp, order);
      } else if (order === 'largest')
        comparison = right.transaction.amount - left.transaction.amount;
      else comparison = left.transaction.amount - right.transaction.amount;
      return comparison || left.index - right.index;
    })
    .map(({ transaction }) => transaction);
}

function comparePendingStatus(
  left: Transaction,
  right: Transaction,
  order: 'newest' | 'oldest'
): number {
  const leftPending = left.status === 'pending';
  const rightPending = right.status === 'pending';
  if (leftPending === rightPending) return 0;
  if (order === 'newest') return leftPending ? -1 : 1;
  return leftPending ? 1 : -1;
}

function transactionIdFromOutpoint(outpoint: string): string {
  const separator = outpoint.lastIndexOf(':');
  return separator > 0 ? outpoint.slice(0, separator) : outpoint;
}

function compareTimestamp(
  left: number | null,
  right: number | null,
  order: 'newest' | 'oldest'
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return order === 'newest' ? right - left : left - right;
}

/**
 * Sort coins without treating confirmation count as a proxy for age. Unknown
 * transaction dates remain last so incomplete history never looks recent.
 */
export function sortCoins(
  coins: readonly Utxo[],
  transactions: readonly Transaction[],
  order: CoinSortOrder = 'newest'
): Utxo[] {
  const timestamps = new Map(
    transactions.map((transaction) => [
      transaction.id,
      parseTimestamp(transaction.date)?.getTime() ?? null
    ])
  );

  const entries = coins.map((coin, index) => ({
    coin,
    index,
    timestamp: timestamps.get(transactionIdFromOutpoint(coin.outpoint)) ?? null
  }));

  return entries
    .sort((left, right) => {
      const newestTieBreak = compareTimestamp(left.timestamp, right.timestamp, 'newest');
      let comparison = 0;

      switch (order) {
        case 'newest':
        case 'oldest':
          comparison = compareTimestamp(left.timestamp, right.timestamp, order);
          break;
        case 'largest':
          comparison = right.coin.amount - left.coin.amount || newestTieBreak;
          break;
        case 'smallest':
          comparison = left.coin.amount - right.coin.amount || newestTieBreak;
          break;
        case 'label-asc':
        case 'label-desc': {
          const leftLabel = left.coin.label.trim();
          const rightLabel = right.coin.label.trim();
          if (!leftLabel && !rightLabel) comparison = newestTieBreak;
          else if (!leftLabel) comparison = 1;
          else if (!rightLabel) comparison = -1;
          else {
            const labelOrder = leftLabel.localeCompare(rightLabel, 'en', {
              numeric: true,
              sensitivity: 'base'
            });
            comparison = (order === 'label-asc' ? labelOrder : -labelOrder) || newestTieBreak;
          }
          break;
        }
      }

      return comparison || left.index - right.index;
    })
    .map(({ coin }) => coin);
}
