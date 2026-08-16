import { describe, expect, it } from 'vitest';
import {
  formatWalletTimestamp,
  parseWalletTimestamp,
  recoveryDrillNotice
} from './backup-presentation';

describe('backup presentation', () => {
  it('parses Rust epoch seconds and JavaScript epoch milliseconds', () => {
    expect(parseWalletTimestamp('1786117680')?.toISOString()).toBe('2026-08-07T15:48:00.000Z');
    expect(parseWalletTimestamp('1786117680000')?.toISOString()).toBe('2026-08-07T15:48:00.000Z');
  });

  it('formats ISO and epoch timestamps as a legible UTC date', () => {
    expect(formatWalletTimestamp('2026-08-07T16:48:00.000Z')).toBe(
      'Friday, August 7, 2026 at 04:48 PM UTC'
    );
    expect(formatWalletTimestamp('not-a-date')).toBe('Date unavailable');
  });

  it('never presents a mismatched drill as successful', () => {
    const address = 'bcrt1qfixtureaddresswithalongmiddleandvisibleending';
    expect(recoveryDrillNotice({ firstAddress: address, matchesCurrentWallet: false })).toEqual({
      title: 'Backup does not match',
      description: 'bcrt1qfixtureadd…isibleending',
      tone: 'danger'
    });
    expect(recoveryDrillNotice({ firstAddress: address, matchesCurrentWallet: true }).title).toBe(
      'Recovery test passed'
    );
  });
});
