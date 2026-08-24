import type { Locale } from '../i18n';

export type MessageValues = Readonly<Record<string, string | number>>;
export type Translation = Readonly<Record<Exclude<Locale, 'en'>, string>>;
export type CatalogSection = Readonly<Record<string, Translation>>;
