import { describe, expect, it } from 'vitest';
import type { WalletSnapshot } from './contracts';
import { shouldShowMobileSend } from './mobile-quick-actions';

function snapshot(
  syncedAt: string | null,
  coins: Array<{ amount: number; frozen: boolean }>
): Pick<WalletSnapshot, 'syncedAt' | 'utxos'> {
  return { syncedAt, utxos: coins as WalletSnapshot['utxos'] };
}

describe('shouldShowMobileSend', () => {
  it('shows Send only for verified history with a positive unfrozen coin', () => {
    expect(
      shouldShowMobileSend(snapshot('2026-11-16T12:00:00.000Z', [{ amount: 1, frozen: false }]))
    ).toBe(true);
  });

  it('keeps Send hidden until wallet history is verified', () => {
    expect(shouldShowMobileSend(snapshot(null, [{ amount: 1, frozen: false }]))).toBe(false);
  });

  it('does not treat frozen, zero, or malformed amounts as spendable', () => {
    expect(
      shouldShowMobileSend(
        snapshot('2026-11-16T12:00:00.000Z', [
          { amount: 5, frozen: true },
          { amount: 0, frozen: false },
          { amount: Number.NaN, frozen: false }
        ])
      )
    ).toBe(false);
  });
});
