import type { ReceiveAddress } from '$lib/types';
import type { Utxo } from '$lib/types';
import type { CoinSelection } from './contracts';
import type { SupportedNetwork } from '$lib/config';

export function addressPrefixForNetwork(network: SupportedNetwork): 'bcrt1' | 'tb1' {
  return network === 'regtest' ? 'bcrt1' : 'tb1';
}

export function hasAddressPrefixForNetwork(address: string, network: SupportedNetwork): boolean {
  const normalized = address.trim().toLowerCase();
  const prefix = addressPrefixForNetwork(network);
  return normalized.startsWith(prefix) && normalized.length > prefix.length + 8;
}

export function normalizePermanentLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('A permanent address label is required.');
  if (normalized.length > 48) throw new Error('Address labels cannot exceed 48 characters.');
  return normalized;
}

export function canDiscardAddress(address: ReceiveAddress, hasObservedTransaction: boolean): boolean {
  return address.status === 'awaiting' && !hasObservedTransaction;
}

export function awaitingPaymentAddresses(addresses: ReceiveAddress[]): ReceiveAddress[] {
  return addresses.filter((address) => address.status === 'awaiting');
}

export function recoveryWordCountIsValid(words: string): boolean {
  return words.trim().split(/\s+/).filter(Boolean).length === 24;
}

export function normalizeCoinSelection(selection?: CoinSelection): CoinSelection {
  if (!selection || selection.mode === 'auto') return { mode: 'auto' };
  const outpoints = [...new Set(selection.outpoints.map((item) => item.trim()).filter(Boolean))];
  if (outpoints.length === 0) throw new Error('Select at least one available coin.');
  return { mode: 'manual', outpoints };
}

export function selectedCoinTotal(coins: Utxo[], outpoints: string[]): number {
  const selected = new Set(outpoints);
  return coins.reduce((total, coin) => total + (selected.has(coin.outpoint) && !coin.frozen ? coin.amount : 0), 0);
}
