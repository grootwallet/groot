import type { ReceiveAddress } from '$lib/types';
import type { Utxo } from '$lib/types';
import type { CoinSelection } from './contracts';
import type { SupportedNetwork } from '$lib/config';
import type { WalletSnapshot } from './contracts';

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
  if (Array.from(normalized).length > 48)
    throw new Error('Address labels cannot exceed 48 characters.');
  return normalized;
}

export function canDiscardAddress(
  address: ReceiveAddress,
  hasObservedTransaction: boolean
): boolean {
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
  if (selection.mode === 'auto')
    return { mode: 'auto', strategy: selection.strategy ?? 'balanced' };
  const outpoints = [...new Set(selection.outpoints.map((item) => item.trim()).filter(Boolean))];
  if (outpoints.length === 0) throw new Error('Select at least one available coin.');
  return { mode: 'manual', outpoints };
}

export function selectedCoinTotal(
  coins: Pick<Utxo, 'outpoint' | 'amount' | 'frozen'>[],
  outpoints: string[]
): number {
  const selected = new Set(outpoints);
  return coins.reduce(
    (total, coin) => total + (selected.has(coin.outpoint) && !coin.frozen ? coin.amount : 0),
    0
  );
}

export type AddressReuseInsight = {
  address: string;
  outpoints: string[];
  labels: string[];
  totalAmount: number;
};

export function addressReuseInsights(
  coins: Pick<Utxo, 'outpoint' | 'amount' | 'address' | 'label'>[]
): AddressReuseInsight[] {
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

export type PolicyMaturitySummary = {
  policyType: 'recovery' | 'inheritance';
  total: number;
  unconfirmed: number;
  immature: number;
  approaching: number;
  mature: number;
  nextRemainingBlocks: number | null;
  chainCurrent: boolean;
};

export function validPolicyMaturity(coin: Utxo): NonNullable<Utxo['policyMaturity']> | null {
  const value = coin.policyMaturity;
  if (!value) return null;
  const integers = [
    value.delayBlocks,
    value.ageBlocks,
    value.approachingAtBlocks,
    value.maturityHeight ?? 0,
    value.remainingBlocks ?? 0,
    value.approximateSecondsRemaining ?? 0
  ];
  if (
    !integers.every((item) => Number.isSafeInteger(item) && item >= 0) ||
    value.approachingAtBlocks > value.delayBlocks ||
    (value.state === 'unconfirmed' && value.remainingBlocks !== null) ||
    (value.state === 'mature' && value.remainingBlocks !== 0) ||
    !(['unconfirmed', 'immature', 'approaching', 'mature'] as string[]).includes(value.state)
  )
    return null;
  return value;
}

export function policyMaturitySummary(
  coins: Utxo[],
  chainTip: WalletSnapshot['chainTip']
): PolicyMaturitySummary | null {
  const maturities = coins.map(validPolicyMaturity).filter((value) => value !== null);
  if (!maturities.length) return null;
  const policyType = maturities[0].policyType;
  if (maturities.some((value) => value.policyType !== policyType)) return null;
  const remaining = maturities
    .map((value) => value.remainingBlocks)
    .filter((value): value is number => value !== null && value > 0);
  return {
    policyType,
    total: maturities.length,
    unconfirmed: maturities.filter((value) => value.state === 'unconfirmed').length,
    immature: maturities.filter((value) => value.state === 'immature').length,
    approaching: maturities.filter((value) => value.state === 'approaching').length,
    mature: maturities.filter((value) => value.state === 'mature').length,
    nextRemainingBlocks: remaining.length ? Math.min(...remaining) : null,
    chainCurrent: chainTip.status === 'recent'
  };
}

export function approximateBlockDuration(seconds: number | null): {
  value: number;
  unit: 'days' | 'months' | 'years';
} | null {
  if (!Number.isSafeInteger(seconds) || seconds === null || seconds < 0) return null;
  const days = Math.ceil(seconds / 86_400);
  if (days < 60) return { value: days, unit: 'days' };
  const months = Math.ceil(days / 30.4375);
  if (months < 24) return { value: months, unit: 'months' };
  return { value: Math.ceil(months / 12), unit: 'years' };
}
