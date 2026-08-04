import { describe, expect, it } from 'vitest';
import { feeRate, sats, WalletError } from './contracts';
import { addressPrefixForNetwork, awaitingPaymentAddresses, canDiscardAddress, hasAddressPrefixForNetwork, normalizeCoinSelection, normalizePermanentLabel, recoveryWordCountIsValid, selectedCoinTotal } from './policy';

describe('wallet invariants', () => {
  it('uses the active network address prefix', () => {
    expect(addressPrefixForNetwork('regtest')).toBe('bcrt1');
    expect(addressPrefixForNetwork('signet')).toBe('tb1');
    expect(addressPrefixForNetwork('testnet4')).toBe('tb1');
    expect(hasAddressPrefixForNetwork(' bcrt1qfixtureaddress000 ', 'regtest')).toBe(true);
    expect(hasAddressPrefixForNetwork('tb1qfixtureaddress000', 'signet')).toBe(true);
    expect(hasAddressPrefixForNetwork('tb1qfixtureaddress000', 'testnet4')).toBe(true);
    expect(hasAddressPrefixForNetwork('tb1qfixtureaddress000', 'regtest')).toBe(false);
    expect(hasAddressPrefixForNetwork('bcrt1short', 'regtest')).toBe(false);
  });

  it('requires and freezes a normalized address label at creation', () => {
    expect(normalizePermanentLabel('  Invoice   104 ')).toBe('Invoice 104');
    expect(() => normalizePermanentLabel('   ')).toThrow('required');
    expect(() => normalizePermanentLabel('x'.repeat(49))).toThrow('48');
  });

  it('allows discarding only an awaiting address with no observed payment', () => {
    const awaiting = { id: 1, address: 'tb1qexample', label: 'Invoice', created: 'now', status: 'awaiting' as const, derivationPath: "m/84'/1'/0'/0/1" };
    expect(canDiscardAddress(awaiting, false)).toBe(true);
    expect(canDiscardAddress(awaiting, true)).toBe(false);
    expect(canDiscardAddress({ ...awaiting, status: 'used' }, false)).toBe(false);
  });

  it('keeps every awaiting address available for independent payment requests', () => {
    const first = { id: 1, address: 'tb1qfirst', label: 'First', created: 'now', status: 'awaiting' as const, derivationPath: "m/84'/1'/0'/0/1" };
    const second = { ...first, id: 2, address: 'tb1qsecond', label: 'Second', derivationPath: "m/84'/1'/0'/0/2" };
    const used = { ...first, id: 3, status: 'used' as const };
    expect(awaitingPaymentAddresses([first, used, second])).toEqual([first, second]);
  });

  it('accepts exactly 24 recovery words', () => {
    expect(recoveryWordCountIsValid(Array.from({ length: 24 }, (_, index) => `word${index}`).join(' '))).toBe(true);
    expect(recoveryWordCountIsValid(Array.from({ length: 12 }, (_, index) => `word${index}`).join(' '))).toBe(false);
    expect(recoveryWordCountIsValid('   ')).toBe(false);
  });

  it('rejects unsafe amounts and invalid fee rates at the boundary', () => {
    expect(() => sats(-1)).toThrow(WalletError);
    expect(() => sats(1.2)).toThrow(WalletError);
    expect(() => feeRate(0)).toThrow(WalletError);
    expect(() => sats(Number.MAX_SAFE_INTEGER + 1)).toThrow(WalletError);
    expect(() => feeRate(Number.NaN)).toThrow(WalletError);
    expect(sats(0)).toBe(0);
    expect(feeRate(1.5)).toBe(1.5);
  });

  it('keeps automatic selection as the safe default and rejects invalid manual selections', () => {
    expect(normalizeCoinSelection(undefined)).toEqual({ mode: 'auto' });
    expect(normalizeCoinSelection({ mode: 'manual', outpoints: ['a:0', 'a:0', 'b:1'] })).toEqual({ mode: 'manual', outpoints: ['a:0', 'b:1'] });
    expect(() => normalizeCoinSelection({ mode: 'manual', outpoints: [] })).toThrow('Select at least one available coin');
  });

  it('totals only selected, available coins', () => {
    const coins = [
      { outpoint: 'a:0', amount: 10, confirmations: 1, address: 'a', label: 'A', frozen: false },
      { outpoint: 'b:1', amount: 20, confirmations: 1, address: 'b', label: 'B', frozen: true }
    ];
    expect(selectedCoinTotal(coins, ['a:0', 'missing:0'])).toBe(10);
    expect(selectedCoinTotal(coins, ['b:1'])).toBe(0);
  });
});
