import { describe, expect, it } from 'vitest';
import type { Transaction } from '$lib/types';
import { sats } from './contracts';
import { pendingBalance, sortTransactionsNewestFirst } from './presentation';

function transaction(id: string, date: string): Transaction {
  return {
    id,
    direction: 'received',
    amount: 1,
    status: 'pending',
    confirmations: 0,
    date,
    address: 'bcrt1qexample',
    label: id
  };
}

describe('pendingBalance', () => {
  it('uses all pending funds exposed by the wallet boundary', () => {
    expect(pendingBalance({
      confirmed: sats(900_000),
      pending: sats(349_000),
      trustedPending: sats(0),
      total: sats(1_249_000)
    })).toBe(349_000);
  });

  it('falls back safely for an older persisted snapshot', () => {
    const legacy = {
      confirmed: sats(900_000),
      trustedPending: sats(0),
      total: sats(1_249_000)
    } as unknown as Parameters<typeof pendingBalance>[0];

    expect(pendingBalance(legacy)).toBe(349_000);
  });
});

describe('sortTransactionsNewestFirst', () => {
  it('sorts timestamps newest first', () => {
    const result = sortTransactionsNewestFirst([
      transaction('old', '2026-08-07T10:00:00.000Z'),
      transaction('new', '2026-08-07T12:00:00.000Z'),
      transaction('middle', '2026-08-07T11:00:00.000Z')
    ]);

    expect(result.map(({ id }) => id)).toEqual(['new', 'middle', 'old']);
  });

  it('preserves source order for equal or invalid timestamps', () => {
    const result = sortTransactionsNewestFirst([
      transaction('first', 'not-a-date'),
      transaction('second', 'not-a-date')
    ]);

    expect(result.map(({ id }) => id)).toEqual(['first', 'second']);
  });
});
