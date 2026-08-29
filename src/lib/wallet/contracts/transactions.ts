import type { LabelSuggestion, ReceiveAddress, Transaction, Utxo } from '$lib/types';
import type { SupportedNetwork } from '$lib/config';
import { WalletError } from './errors';

export type Sats = number & { readonly __brand: 'Sats' };
export type FeeRate = number & { readonly __brand: 'SatPerVbyte' };

export type WalletSnapshot = {
  network: SupportedNetwork;
  balance: { confirmed: Sats; pending: Sats; trustedPending: Sats; total: Sats };
  transactions: Transaction[];
  utxos: Utxo[];
  receiveAddresses: ReceiveAddress[];
  labelSuggestions: LabelSuggestion[];
  syncedAt: string | null;
  chainTip: {
    height: number;
    observedAt: string | null;
    status: 'recent' | 'stale' | 'unknown';
  };
};

export type FeeEstimates = {
  economy: FeeRate;
  standard: FeeRate;
  priority: FeeRate;
  source: string;
};
export type MaxSpend = { amount: Sats; fee: Sats };

export type SelectionImpact = {
  strategy: 'balanced' | 'private' | 'lower_fee' | 'manual' | 'acceleration';
  selectedInputCount: number;
  estimatedInputWeight: number;
  fundingLabels: import('$lib/types').PermanentLabel[];
  provenanceState: 'known' | 'mixed' | 'unknown';
  existingClusterCount: number;
  newClusterLinks: number;
  hasUnknownProvenance: boolean;
  hasAddressReuse: boolean;
  feeDifferenceVsPrivate: number | null;
};

export type CoinSelectionPreview = {
  selectedAmount: Sats;
  selectedInputCount: number;
  estimatedInputWeight: number;
  fundingLabels: import('$lib/types').PermanentLabel[];
  provenanceState: 'known' | 'mixed' | 'unknown';
  existingClusterCount: number;
  newClusterLinks: number;
  hasUnknownProvenance: boolean;
  hasAddressReuse: boolean;
  oneExistingGroupCanFund: boolean;
};

export type PaymentProposal = {
  proposalId: string;
  recipient: string;
  recipientTestnetAlias: string | null;
  recipientIsWalletOwned?: boolean;
  walletControlledOutputAmount?: Sats | null;
  recipientDerivationPaths?: string[];
  label: string;
  labels?: string[];
  amount: Sats;
  fee: Sats;
  feeRate: FeeRate;
  total: Sats;
  change: Sats;
  changeAddresses: string[];
  changeTestnetAliases: (string | null)[];
  changeDerivationPaths?: string[][];
  outputCount: number;
  selectedOutpoints: string[];
  inputs: { outpoint: string; amount: Sats; sequence: number; derivationPaths?: string[] }[];
  locktime: number;
  rbf: boolean;
  network: SupportedNetwork;
  selectionImpact: SelectionImpact;
  acceleration?: AccelerationReview | null;
};

export type AccelerationReview = {
  method: AccelerationMethod;
  originalTxid: string;
  originalFeeRate: FeeRate;
  minimumFeeRate: FeeRate;
  targetFeeRate: FeeRate;
  incrementalFee: Sats;
  recommendationSource: 'bitcoin_core' | 'replacement_fallback' | 'custom' | 'legacy';
};

export type AccelerationQuote = {
  method: 'rbf';
  originalTxid: string;
  originalFee: Sats;
  originalVsize: number;
  originalEffectiveFeeRate: FeeRate;
  minimumFeeRate: FeeRate;
  targetFeeRate: FeeRate;
  estimatedReplacementFee: Sats;
  incrementalFee: Sats;
  resultingEffectiveFeeRate: FeeRate;
  replacementVsize: number;
  recommendationSource: 'bitcoin_core' | 'replacement_fallback' | 'custom';
};

export type LabelExportResult = {
  saved: boolean;
  recordCount: number;
  revealToken: string | null;
  revealLabel: string | null;
};
export type LabelImportResult = {
  importedCount: number;
  unchangedCount: number;
  ignoredCount: number;
  spendabilityChangeCount: number;
};

export type BroadcastResult = {
  txid: string;
  snapshot: WalletSnapshot;
  syncPending: boolean;
};

export type AutomaticSelectionStrategy = 'balanced' | 'private' | 'lower_fee';
export type CoinSelection =
  { mode: 'auto'; strategy?: AutomaticSelectionStrategy } | { mode: 'manual'; outpoints: string[] };
export type AccelerationMethod = 'rbf' | 'cpfp';
export function sats(value: number): Sats {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new WalletError('invalid_amount', 'Satoshi amount must be a non-negative safe integer.');
  return value as Sats;
}

export function feeRate(value: number): FeeRate {
  if (!Number.isFinite(value) || value <= 0)
    throw new WalletError('invalid_amount', 'Fee rate must be greater than zero.');
  return value as FeeRate;
}
