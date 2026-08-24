import { describe, expect, it } from 'vitest';
import {
  formatConfirmationCount,
  formatInteger,
  formatWalletCount,
  normalizeLocale,
  readPersistedLocale,
  t
} from './i18n';
import { copyCatalog, localizedError, translate } from './i18n-catalog';

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

  it('translates catalog copy and interpolates values without translating user data', () => {
    expect(translate('fr', 'Dismiss')).toBe('Fermer');
    expect(translate('es', 'Try again')).toBe('Intentar de nuevo');
    expect(translate('en', 'Loading…')).toBe('Loading…');
    expect(translate('es', '{blocks} blocks · full block history', { blocks: '149.669' })).toBe(
      '149.669 bloques · historial completo de bloques'
    );
    expect(translate('fr', '{signerName} matches this wallet.', { signerName: 'Mon Ledger' })).toBe(
      'Mon Ledger correspond à ce portefeuille.'
    );
  });

  it('does not leak English native errors into non-English UI', () => {
    expect(localizedError({ code: 'invalid_credential' }, 'es')).toBe('Credencial incorrecta.');
    expect(localizedError(new Error('Uncatalogued native detail'), 'fr')).toBe(
      'Une erreur est survenue. Réessayez.'
    );
  });

  it('provides non-empty French and Spanish copy for every catalog entry', () => {
    expect(Object.keys(copyCatalog).length).toBeGreaterThan(800);
    for (const translation of Object.values(copyCatalog)) {
      expect(translation.fr.trim()).not.toBe('');
      expect(translation.es.trim()).not.toBe('');
    }
  });
});
