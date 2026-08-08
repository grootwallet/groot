import { describe, expect, it } from 'vitest';
import type { Transaction, Utxo } from '$lib/types';
import { sats } from './contracts';
import { pendingBalance, sortCoins, sortTransactionsNewestFirst } from './presentation';

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

function coin(outpoint: string, amount: number, label: string): Utxo {
	return {
		outpoint,
		amount,
		confirmations: 0,
		address: 'bcrt1qexample',
		label,
		frozen: false
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

describe('sortCoins', () => {
	const transactions = [
		transaction('older', '2026-08-01T10:00:00Z'),
		transaction('newer', '2026-08-07T10:00:00Z'),
		transaction('middle', '2026-08-04T10:00:00Z')
	];
	const coins = [
		coin('older:0', 200, 'Zulu'),
		coin('newer:0', 100, 'Alpha'),
		coin('middle:0', 300, 'Middle')
	];

	it('defaults to authoritative transaction dates newest first without mutating input', () => {
		const source = [...coins];
		expect(sortCoins(source, transactions).map((item) => item.outpoint)).toEqual([
			'newer:0',
			'middle:0',
			'older:0'
		]);
		expect(source).toEqual(coins);
	});

	it('sorts oldest first and keeps unknown dates last', () => {
		const withUnknown = [...coins, coin('unknown:0', 50, 'Unknown')];
		expect(sortCoins(withUnknown, transactions, 'oldest').map((item) => item.outpoint)).toEqual([
			'older:0',
			'middle:0',
			'newer:0',
			'unknown:0'
		]);
		expect(sortCoins(withUnknown, transactions, 'newest').at(-1)?.outpoint).toBe('unknown:0');
	});

	it('sorts by amount in both directions', () => {
		expect(sortCoins(coins, transactions, 'largest').map((item) => item.amount)).toEqual([
			300, 200, 100
		]);
		expect(sortCoins(coins, transactions, 'smallest').map((item) => item.amount)).toEqual([
			100, 200, 300
		]);
	});

	it('sorts labels in both directions and keeps blank labels last', () => {
		const withBlank = [...coins, coin('blank:0', 400, '   ')];
		expect(sortCoins(withBlank, transactions, 'label-asc').map((item) => item.label.trim())).toEqual([
			'Alpha',
			'Middle',
			'Zulu',
			''
		]);
		expect(sortCoins(withBlank, transactions, 'label-desc').map((item) => item.label.trim())).toEqual([
			'Zulu',
			'Middle',
			'Alpha',
			''
		]);
	});
});
