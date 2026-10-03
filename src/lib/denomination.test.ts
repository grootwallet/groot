import { describe, expect, it } from 'vitest';
import {
  amountInputValue,
  amountUnit,
  convertAmountInput,
  formatAmount,
  initDenomination,
  parseAmountInput,
  setDenomination
} from './denomination';

describe('amount denomination', () => {
  it('uses canonical denomination casing', () => {
    expect(amountUnit('sats')).toBe('sats');
    expect(amountUnit('btc')).toBe('BTC');
  });

  it('keeps BTC at eight decimals as one continuous value', () => {
    expect(formatAmount(1_234_560, 'btc')).toBe('0.01234560');
  });

  it('round-trips exact integer satoshi values without floating-point accounting', () => {
    expect(amountInputValue(143_182, 'btc')).toBe('0.00143182');
    expect(parseAmountInput('0.00143182', 'btc')).toBe(143_182);
    expect(parseAmountInput('0.000000001', 'btc')).toBeNaN();
    expect(parseAmountInput('143,182', 'sats')).toBe(143_182);
    expect(parseAmountInput('1e5', 'sats')).toBeNaN();
    expect(parseAmountInput('0x10', 'sats')).toBeNaN();
    expect(parseAmountInput('1,00', 'sats')).toBeNaN();
  });

  it('converts valid send inputs exactly and refuses to reinterpret invalid values', () => {
    expect(convertAmountInput('0.00039780', 'btc', 'sats')).toBe('39780');
    expect(convertAmountInput('39,780', 'sats', 'btc')).toBe('0.00039780');
    expect(convertAmountInput('', 'btc', 'sats')).toBe('');
    expect(convertAmountInput('1.5', 'sats', 'btc')).toBeNull();
  });

  it('persists only the allowlisted display preference', () => {
    let stored = '';
    setDenomination('btc', { setItem: (_key, value) => (stored = value) });
    expect(stored).toBe('btc');
    expect(initDenomination({ getItem: () => 'unexpected' })).toBe('sats');
  });
});
