import { writable } from 'svelte/store';
import { FIAT_CURRENCIES, type FiatCurrency } from './types';

export const FIAT_CURRENCY_STORAGE_KEY = 'groot-fiat-currency';
export const fiatCurrency = writable<FiatCurrency>('USD');

export function normalizeFiatCurrency(value: string | null | undefined): FiatCurrency {
  return FIAT_CURRENCIES.includes(value as FiatCurrency) ? (value as FiatCurrency) : 'USD';
}

export function initFiatCurrency(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
): FiatCurrency {
  const value = normalizeFiatCurrency(storage?.getItem(FIAT_CURRENCY_STORAGE_KEY));
  fiatCurrency.set(value);
  return value;
}

export function setFiatCurrency(
  value: FiatCurrency,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
) {
  fiatCurrency.set(value);
  storage?.setItem(FIAT_CURRENCY_STORAGE_KEY, value);
}

export function formatFiat(value: number, currency: FiatCurrency): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function fiatValue(sats: number, bitcoinPrice: number): number {
  return (sats / 100_000_000) * bitcoinPrice;
}
