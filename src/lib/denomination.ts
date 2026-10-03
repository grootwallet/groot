import { writable } from 'svelte/store';

export type Denomination = 'sats' | 'btc';

export const DENOMINATION_STORAGE_KEY = 'groot-denomination';
export const denomination = writable<Denomination>('sats');

export function initDenomination(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
): Denomination {
  const value = storage?.getItem(DENOMINATION_STORAGE_KEY) === 'btc' ? 'btc' : 'sats';
  denomination.set(value);
  return value;
}

export function setDenomination(
  value: Denomination,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
): void {
  denomination.set(value);
  storage?.setItem(DENOMINATION_STORAGE_KEY, value);
}

export function formatAmount(sats: number, unit: Denomination): string {
  return unit === 'btc'
    ? (sats / 100_000_000).toFixed(8)
    : new Intl.NumberFormat('en-US').format(sats);
}

export function amountUnit(unit: Denomination): 'BTC' | 'sats' {
  return unit === 'btc' ? 'BTC' : 'sats';
}

export function amountInputValue(sats: number, unit: Denomination): string {
  return unit === 'btc' ? (sats / 100_000_000).toFixed(8) : String(sats);
}

export function convertAmountInput(
  value: string,
  from: Denomination,
  to: Denomination
): string | null {
  if (!value.trim()) return '';
  const parsed = parseAmountInput(value, from);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? amountInputValue(parsed, to) : null;
}

export function parseAmountInput(value: string, unit: Denomination): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (unit === 'sats') {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(trimmed)) return Number.NaN;
    const parsed = Number(trimmed.replaceAll(',', ''));
    return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
  }
  if (!/^\d+(?:\.\d{0,8})?$/.test(trimmed)) return Number.NaN;
  const [whole, fraction = ''] = trimmed.split('.');
  const parsed = Number(whole) * 100_000_000 + Number(fraction.padEnd(8, '0'));
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}
