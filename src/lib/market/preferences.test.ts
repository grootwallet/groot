import { describe, expect, it } from 'vitest';
import { fiatValue, formatFiat, normalizeFiatCurrency } from './preferences';

describe('market preferences', () => {
  it('allows only the initial fiat currencies', () => {
    expect(normalizeFiatCurrency('EUR')).toBe('EUR');
    expect(normalizeFiatCurrency('CAD')).toBe('USD');
  });

  it('derives display-only fiat value without changing satoshi accounting', () => {
    expect(fiatValue(50_000_000, 64_000)).toBe(32_000);
    expect(formatFiat(32_000, 'USD')).toBe('$32,000.00');
  });
});
