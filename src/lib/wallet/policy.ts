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
  if (Array.from(normalized).length > 48) throw new Error('Address labels cannot exceed 48 characters.');
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
  if (!selection) return { mode: 'auto', strategy: 'balanced' };
  if (selection.mode === 'auto') return { mode: 'auto', strategy: selection.strategy ?? 'balanced' };
  const outpoints = [...new Set(selection.outpoints.map((item) => item.trim()).filter(Boolean))];
  if (outpoints.length === 0) throw new Error('Select at least one available coin.');
  return { mode: 'manual', outpoints };
}

export function selectedCoinTotal(coins: Pick<Utxo, 'outpoint' | 'amount' | 'frozen'>[], outpoints: string[]): number {
  const selected = new Set(outpoints);
  return coins.reduce((total, coin) => total + (selected.has(coin.outpoint) && !coin.frozen ? coin.amount : 0), 0);
}

export type AddressReuseInsight = {
  address: string;
  outpoints: string[];
  labels: string[];
  totalAmount: number;
};

export function addressReuseInsights(coins: Pick<Utxo, 'outpoint' | 'amount' | 'address' | 'label'>[]): AddressReuseInsight[] {
  const groups = new Map<string, AddressReuseInsight>();

  for (const coin of coins) {
    const address = coin.address.trim();
    if (!address || address.toLowerCase() === 'unknown') continue;

    const existing = groups.get(address);
    if (existing) {
      existing.outpoints.push(coin.outpoint);
      existing.totalAmount += coin.amount;
      if (coin.label && !existing.labels.includes(coin.label)) existing.labels.push(coin.label);
      continue;
    }

    groups.set(address, {
      address,
      outpoints: [coin.outpoint],
      labels: coin.label ? [coin.label] : [],
      totalAmount: coin.amount
    });
  }

  return [...groups.values()].filter((group) => group.outpoints.length > 1);
}
