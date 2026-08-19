import { writable } from 'svelte/store';

export type Locale = 'en' | 'fr' | 'es';
export const LOCALE_STORAGE_KEY = 'groot-language';

export const localeOptions: ReadonlyArray<{ value: Locale; label: string; shortLabel: string }> = [
  { value: 'en', label: 'English', shortLabel: 'EN' },
  { value: 'fr', label: 'Français', shortLabel: 'FR' },
  { value: 'es', label: 'Español', shortLabel: 'ES' }
];

export const locale = writable<Locale>('en');

export function normalizeLocale(value: string | null | undefined): Locale | null {
  const language = value?.trim().toLowerCase().split('-')[0];
  return language === 'en' || language === 'fr' || language === 'es' ? language : null;
}

export function readPersistedLocale(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage,
  browserLocale: string | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.language
): Locale {
  return (
    normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY)) ?? normalizeLocale(browserLocale) ?? 'en'
  );
}

export function setLocale(
  next: Locale,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage,
  root: Pick<HTMLElement, 'lang'> | undefined = typeof document === 'undefined'
    ? undefined
    : document.documentElement
) {
  locale.set(next);
  storage?.setItem(LOCALE_STORAGE_KEY, next);
  if (root) root.lang = next;
}

export function initLocale(): Locale {
  const initial = readPersistedLocale();
  locale.set(initial);
  if (typeof document !== 'undefined') document.documentElement.lang = initial;
  return initial;
}

const messages = {
  en: {
    wallets: 'Wallets',
    wallet: 'wallet',
    overview: 'Overview',
    activity: 'Activity',
    coins: 'Coins',
    policy: 'Policy',
    settings: 'Settings',
    addWallet: 'Add wallet',
    receive: 'Receive',
    send: 'Send',
    language: 'Language',
    appAppearance: 'App appearance',
    languageDescription: 'Used for shared navigation and statuses on this device.',
    theme: 'Theme',
    themeDescription: 'Quiet contrast with a restrained tricolor accent.',
    light: 'Light',
    dark: 'Dark',
    unconfirmed: 'Unconfirmed',
    confirmed: 'Confirmed',
    replaced: 'Replaced',
    awaitingConfirmation: 'Awaiting confirmation',
    notCounted: 'Not counted · replaced',
    sortCoins: 'Sort coins',
    newestFirst: 'Newest first',
    oldestFirst: 'Oldest first',
    largestFirst: 'Largest first',
    smallestFirst: 'Smallest first',
    labelAscending: 'Label A–Z',
    labelDescending: 'Label Z–A'
  },
  fr: {
    wallets: 'Portefeuilles',
    wallet: 'portefeuille',
    overview: 'Aperçu',
    activity: 'Activité',
    coins: 'Pièces',
    policy: 'Politique',
    settings: 'Réglages',
    addWallet: 'Ajouter un portefeuille',
    receive: 'Recevoir',
    send: 'Envoyer',
    language: 'Langue',
    appAppearance: 'Apparence',
    languageDescription: 'Utilisée pour la navigation et les états sur cet appareil.',
    theme: 'Thème',
    themeDescription: 'Un contraste doux avec un accent tricolore discret.',
    light: 'Clair',
    dark: 'Sombre',
    unconfirmed: 'Non confirmée',
    confirmed: 'Confirmée',
    replaced: 'Remplacée',
    awaitingConfirmation: 'En attente de confirmation',
    notCounted: 'Non comptée · remplacée',
    sortCoins: 'Trier les pièces',
    newestFirst: 'Plus récentes',
    oldestFirst: 'Plus anciennes',
    largestFirst: 'Plus grandes',
    smallestFirst: 'Plus petites',
    labelAscending: 'Libellé A–Z',
    labelDescending: 'Libellé Z–A'
  },
  es: {
    wallets: 'Carteras',
    wallet: 'cartera',
    overview: 'Resumen',
    activity: 'Actividad',
    coins: 'Monedas',
    policy: 'Política',
    settings: 'Ajustes',
    addWallet: 'Añadir cartera',
    receive: 'Recibir',
    send: 'Enviar',
    language: 'Idioma',
    appAppearance: 'Apariencia',
    languageDescription: 'Se usa para la navegación y los estados en este dispositivo.',
    theme: 'Tema',
    themeDescription: 'Contraste suave con un discreto acento tricolor.',
    light: 'Claro',
    dark: 'Oscuro',
    unconfirmed: 'Sin confirmar',
    confirmed: 'Confirmada',
    replaced: 'Reemplazada',
    awaitingConfirmation: 'Pendiente de confirmación',
    notCounted: 'No contabilizada · reemplazada',
    sortCoins: 'Ordenar monedas',
    newestFirst: 'Más recientes',
    oldestFirst: 'Más antiguas',
    largestFirst: 'Más grandes',
    smallestFirst: 'Más pequeñas',
    labelAscending: 'Etiqueta A–Z',
    labelDescending: 'Etiqueta Z–A'
  }
} as const;

export type MessageKey = keyof typeof messages.en;

export function t(key: MessageKey, current: Locale): string {
  return messages[current][key];
}

export function formatConfirmationCount(count: number, current: Locale): string {
  const unit =
    current === 'fr'
      ? `confirmation${count === 1 ? '' : 's'}`
      : current === 'es'
        ? count === 1
          ? 'confirmación'
          : 'confirmaciones'
        : `confirmation${count === 1 ? '' : 's'}`;
  return `${count.toLocaleString(current)} ${unit}`;
}

export function formatWalletCount(count: number, current: Locale): string {
  const unit =
    current === 'fr'
      ? `portefeuille${count === 1 ? '' : 's'}`
      : current === 'es'
        ? `cartera${count === 1 ? '' : 's'}`
        : `wallet${count === 1 ? '' : 's'}`;
  return `${count.toLocaleString(current)} ${unit}`;
}
