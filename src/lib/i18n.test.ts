import { describe, expect, it } from 'vitest';
import {
  formatConfirmationCount,
  formatWalletCount,
  normalizeLocale,
  readPersistedLocale
} from './i18n';

describe('locale preferences', () => {
  it('accepts supported regional locales and rejects unsupported ones', () => {
    expect(normalizeLocale('fr-FR')).toBe('fr');
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('de-DE')).toBeNull();
  });

  it('prefers the saved locale and safely falls back', () => {
    expect(readPersistedLocale({ getItem: () => 'es' }, 'fr-FR')).toBe('es');
    expect(readPersistedLocale({ getItem: () => null }, 'fr-FR')).toBe('fr');
    expect(readPersistedLocale({ getItem: () => 'invalid' }, 'de-DE')).toBe('en');
  });

  it('uses correct singular and plural confirmation grammar', () => {
    expect(formatConfirmationCount(1, 'en')).toBe('1 confirmation');
    expect(formatConfirmationCount(2, 'en')).toBe('2 confirmations');
    expect(formatConfirmationCount(1, 'fr')).toBe('1 confirmation');
    expect(formatConfirmationCount(2, 'es')).toBe('2 confirmaciones');
  });

  it('pluralizes wallet counts in every supported locale', () => {
    expect(formatWalletCount(1, 'en')).toBe('1 wallet');
    expect(formatWalletCount(2, 'fr')).toBe('2 portefeuilles');
    expect(formatWalletCount(2, 'es')).toBe('2 carteras');
  });
});
