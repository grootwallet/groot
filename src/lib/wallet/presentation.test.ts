import { describe, expect, it } from 'vitest';
import type { Transaction, Utxo } from '$lib/types';
import { sats } from './contracts';
import {
  pendingBalance,
  pendingBalanceBreakdown,
  sortCoins,
  sortTransactions,
  sortTransactionsNewestFirst
} from './presentation';

function transaction(id: string, date: string): Transaction {
  return {
    id,
    kind: 'payment',
    direction: 'received',
    amount: 1,
    status: 'pending',
    confirmations: 0,
    date,
    address: 'bcrt1qexample',
    label: id,
    intentLabel: null,
    provenance: {
      state: 'unknown',
      context: 'received',
      labels: [],
      clusterCount: 0,
      addressReused: false
    }
  };
}

function coin(outpoint: string, amount: number, label: string): Utxo {
  return {
    outpoint,
    amount,
    confirmations: 0,
    address: 'bcrt1qexample',
    label,
    frozen: false,
    primaryLabel: null,
    provenance: {
      state: 'unknown',
      context: 'received',
      labels: [],
      clusterCount: 0,
      addressReused: false
    }
  };
}

describe('pendingBalance', () => {
  it('uses all pending funds exposed by the wallet boundary', () => {
    expect(
      pendingBalance({
        confirmed: sats(900_000),
        pending: sats(349_000),
        trustedPending: sats(0),
        total: sats(1_249_000)
      })
    ).toBe(349_000);
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

describe('pendingBalanceBreakdown', () => {
  it('distinguishes unconfirmed change from the outgoing payment and fee', () => {
    const sent = transaction('sent', '2026-08-15T00:19:00Z');
    sent.direction = 'sent';
    sent.amount = 10_000;
    sent.fee = 402;
    const snapshot = {
      network: 'regtest',
      balance: {
        confirmed: sats(1_999_000),
        pending: sats(89_598),
        trustedPending: sats(89_598),
        total: sats(2_088_598)
      },
      transactions: [sent],
      utxos: [],
      receiveAddresses: [],
      labelSuggestions: [],
      syncedAt: null,
      chainTip: { height: 0, observedAt: null, status: 'unknown' }
    } satisfies import('./contracts').WalletSnapshot;

    expect(pendingBalanceBreakdown(snapshot)).toEqual({
      incoming: 0,
      change: 89_598,
      outgoing: 10_402
    });
  });

  it('counts a pending self-spend fee exactly once', () => {
    const cpfp = transaction('cpfp', '2026-08-30T20:36:00Z');
    cpfp.kind = 'self_spend';
    cpfp.direction = 'sent';
    cpfp.amount = 110;
    cpfp.fee = 110;
    const snapshot = {
      network: 'testnet4',
      balance: {
        confirmed: sats(0),
        pending: sats(39_890),
        trustedPending: sats(39_890),
        total: sats(39_890)
      },
      transactions: [cpfp],
      utxos: [],
      receiveAddresses: [],
      labelSuggestions: [],
      syncedAt: null,
      chainTip: { height: 0, observedAt: null, status: 'unknown' }
    } satisfies import('./contracts').WalletSnapshot;

    expect(pendingBalanceBreakdown(snapshot)).toEqual({
      incoming: 0,
      change: 39_890,
      outgoing: 110
    });
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

  it('keeps active pending transactions above confirmed block timestamps', () => {
    const pending = transaction('pending', '2026-08-20T20:22:00Z');
    const confirmed = transaction('confirmed', '2026-08-20T21:05:00Z');
    confirmed.status = 'confirmed';
    confirmed.confirmations = 3;

    expect(sortTransactionsNewestFirst([confirmed, pending]).map(({ id }) => id)).toEqual([
      'pending',
      'confirmed'
    ]);
  });

  it('places a locally broadcast payment first when pending timestamps tie', () => {
    const incoming = transaction('incoming', '2026-08-28T20:18:00Z');
    const outgoing = transaction('outgoing', '2026-08-28T20:18:00Z');
    outgoing.direction = 'sent';
    outgoing.intentLabel = { id: 'payment-label', text: 'To jade', origin: 'payment' };

    expect(sortTransactionsNewestFirst([incoming, outgoing]).map(({ id }) => id)).toEqual([
      'outgoing',
      'incoming'
    ]);
  });
});

describe('sortTransactions', () => {
  const older = transaction('older', '2026-08-01T10:00:00Z');
  const newer = transaction('newer', '2026-08-07T10:00:00Z');
  older.amount = 900;
  newer.amount = 100;

  it('sorts activity by authoritative date in either direction', () => {
    expect(sortTransactions([older, newer], 'newest').map(({ id }) => id)).toEqual([
      'newer',
      'older'
    ]);
    expect(sortTransactions([older, newer], 'oldest').map(({ id }) => id)).toEqual([
      'older',
      'newer'
    ]);
  });

  it('places pending activity first for latest and last for earliest', () => {
    const pending = transaction('pending', '2026-08-20T20:22:00Z');
    const futureBlockTime = transaction('confirmed', '2026-08-20T21:05:00Z');
    futureBlockTime.status = 'confirmed';
    futureBlockTime.confirmations = 3;

    expect(sortTransactions([futureBlockTime, pending], 'newest').map(({ id }) => id)).toEqual([
      'pending',
      'confirmed'
    ]);
    expect(sortTransactions([futureBlockTime, pending], 'oldest').map(({ id }) => id)).toEqual([
      'confirmed',
      'pending'
    ]);
  });

  it('orders equal-time pending activity around the known local payment intent', () => {
    const incoming = transaction('incoming', '2026-08-28T20:18:00Z');
    const outgoing = transaction('outgoing', '2026-08-28T20:18:00Z');
    outgoing.direction = 'sent';
    outgoing.intentLabel = { id: 'payment-label', text: 'To jade', origin: 'payment' };

    expect(sortTransactions([incoming, outgoing], 'newest').map(({ id }) => id)).toEqual([
      'outgoing',
      'incoming'
    ]);
    expect(sortTransactions([incoming, outgoing], 'oldest').map(({ id }) => id)).toEqual([
      'incoming',
      'outgoing'
    ]);
  });

  it('sorts activity by absolute payment amount', () => {
    expect(sortTransactions([newer, older], 'largest').map(({ id }) => id)).toEqual([
      'older',
      'newer'
    ]);
    expect(sortTransactions([older, newer], 'smallest').map(({ id }) => id)).toEqual([
      'newer',
      'older'
    ]);
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
    expect(
      sortCoins(withBlank, transactions, 'label-asc').map((item) => item.label.trim())
    ).toEqual(['Alpha', 'Middle', 'Zulu', '']);
    expect(
      sortCoins(withBlank, transactions, 'label-desc').map((item) => item.label.trim())
    ).toEqual(['Zulu', 'Middle', 'Alpha', '']);
  });
});
