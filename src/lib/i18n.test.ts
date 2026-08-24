import { describe, expect, it } from 'vitest';
import {
  formatConfirmationCount,
  formatInteger,
  formatWalletCount,
  normalizeLocale,
  readPersistedLocale,
  t
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

  it('formats large integer values with the selected locale separator', () => {
    expect(formatInteger(149_669, 'en')).toBe('149,669');
    expect(formatInteger(149_669, 'fr')).toBe('149\u202f669');
    expect(formatInteger(149_669, 'es')).toBe('149.669');
  });

  it('translates every app-appearance control', () => {
    expect(t('appAppearance', 'fr')).toBe('Apparence');
    expect(t('theme', 'fr')).toBe('Thème');
    expect(t('light', 'es')).toBe('Claro');
    expect(t('dark', 'es')).toBe('Oscuro');
  });
});
