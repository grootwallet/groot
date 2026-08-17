import { describe, expect, it } from 'vitest';
import {
  amountInputValue,
  bitcoinAmountParts,
  formatAmount,
  initDenomination,
  parseAmountInput,
  setDenomination
} from './denomination';

describe('amount denomination', () => {
  it('keeps BTC at eight decimals and separates leading zeroes from the meaningful amount', () => {
    expect(formatAmount(1_234_560, 'btc')).toBe('0.01234560');
    expect(bitcoinAmountParts(1_234_560)).toEqual({ quiet: '0.0', strong: '1234560' });
  });

  it('round-trips exact integer satoshi values without floating-point accounting', () => {
    expect(amountInputValue(143_182, 'btc')).toBe('0.00143182');
    expect(parseAmountInput('0.00143182', 'btc')).toBe(143_182);
    expect(parseAmountInput('0.000000001', 'btc')).toBeNaN();
    expect(parseAmountInput('143,182', 'sats')).toBe(143_182);
  });

  it('persists only the allowlisted display preference', () => {
    let stored = '';
    setDenomination('btc', { setItem: (_key, value) => (stored = value) });
    expect(stored).toBe('btc');
    expect(initDenomination({ getItem: () => 'unexpected' })).toBe('sats');
  });
});
