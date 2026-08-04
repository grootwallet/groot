import type { ReceiveAddress, Transaction, Utxo } from '$lib/types';
import type { SupportedNetwork } from '$lib/config';
import type { CosignerDraft, PolicyDraft } from '$lib/multisig/policy';

export type Sats = number & { readonly __brand: 'Sats' };
export type FeeRate = number & { readonly __brand: 'SatPerVbyte' };

export type WalletSnapshot = {
  network: SupportedNetwork;
  balance: { confirmed: Sats; trustedPending: Sats; total: Sats };
  transactions: Transaction[];
  utxos: Utxo[];
  receiveAddresses: ReceiveAddress[];
  syncedAt: string | null;
};

export type FeeEstimates = {
  economy: FeeRate;
  standard: FeeRate;
  priority: FeeRate;
  source: string;
};

export type PaymentProposal = {
  proposalId: string;
  recipient: string;
  amount: Sats;
  fee: Sats;
  feeRate: FeeRate;
  total: Sats;
  selectedOutpoints: string[];
};

export type CoinSelection = { mode: 'auto' } | { mode: 'manual'; outpoints: string[] };

export type HardwareDevice = {
  id: string;
  label: string;
  model: string;
  fingerprint: string | null;
  connected: boolean;
};

export type CosignerHealthCheck = {
  status: 'healthy' | 'record_valid' | 'attention';
  checkedAt: string;
  summary: string;
};

export type MultisigWallet = PolicyDraft & {
  kind: 'multisig';
  externalDescriptor: string;
  internalDescriptor: string;
  createdAt: string;
  policyType?: 'standard' | 'recovery' | 'inheritance';
  recoveryTemplate?: RecoveryTemplate;
  spendingPaths?: TimedSpendingPath[];
};

export type MultisigPreview = {
  name: string;
  threshold: number;
  cosigners: CosignerDraft[];
  externalDescriptor: string;
  internalDescriptor: string;
};

export type MultisigProposal = PaymentProposal & {
  psbt: string;
  signed: number;
  required: number;
  canFinalize: boolean;
  signedFingerprints: string[];
  status: 'collecting' | 'ready' | 'broadcast' | 'cancelled';
  createdAt: string;
};

export type SpendingPath = { threshold: number; signerIds: string[] };
export type TimedSpendingPath = SpendingPath & { availableAfterBlocks: number };
export type RecoveryTemplate =
  | { type: 'recovery'; immediate: SpendingPath; recovery: TimedSpendingPath }
  | { type: 'decaying'; stages: TimedSpendingPath[] }
  | { type: 'expanding'; stages: TimedSpendingPath[] };
export type RecoveryPolicyAnalysis = {
  externalDescriptor: string;
  internalDescriptor: string;
  paths: TimedSpendingPath[];
  warnings: { code: string; message: string }[];
  maxSatisfactionWeight: number;
};
export type RecoveryDrill = { firstAddress: string; matchesCurrentWallet: boolean };
export type MnemonicPresentation =
  | { mode: 'native' }
  | { mode: 'fixture'; words: string[] };
export type WalletProfile = {
  id: string;
  name: string;
  network: SupportedNetwork;
  kind: 'single_key' | 'multisig' | 'watch_only';
  descriptorChecksum: string;
  createdAt: number;
};
export type WalletRegistry = {
  version: number;
  selectedWalletId: string | null;
  wallets: WalletProfile[];
};

export type WalletEvent =
  | { type: 'payment_received'; txid: string; amount: Sats; balance: Sats }
  | { type: 'first_confirmation'; txid: string; balance: Sats }
  | { type: 'transaction_broadcast'; txid: string; balance: Sats };

export type WalletErrorCode =
  | 'invalid_credential'
  | 'invalid_address'
  | 'invalid_amount'
  | 'insufficient_funds'
  | 'address_not_discardable'
  | 'network_unavailable'
  | 'wallet_locked'
  | 'wallet_not_found'
  | 'invalid_mnemonic'
  | 'invalid_label'
  | 'wallet_already_exists'
  | 'wallet_corrupt'
  | 'secure_storage_unavailable'
  | 'onboarding_cancelled'
  | 'onboarding_expired'
  | 'wrong_wallet_kind'
  | 'proposal_not_found'
  | 'broadcast_failed'
  | 'invalid_wallet_name'
  | 'invalid_cosigner_count'
  | 'unsafe_threshold'
  | 'duplicate_fingerprint'
  | 'duplicate_xpub'
  | 'invalid_descriptor'
  | 'hardware_unavailable'
  | 'malformed_psbt'
  | 'psbt_too_large'
  | 'proposal_mismatch'
  | 'unknown_signer'
  | 'unsupported_sighash'
  | 'premature_finalization'
  | 'insufficient_signatures'
  | 'finalization_failed'
  | 'rate_limited'
  | 'invalid_backup'
  | 'backup_too_large'
  | 'backup_mismatch'
  | 'confirmation_mismatch'
  | 'invalid_timeline'
  | 'invalid_decay'
  | 'invalid_expansion'
  | 'invalid_signer_count'
  | 'unknown_signer'
  | 'duplicate_signer'
  | 'invalid_delay'
  | 'invalid_key'
  | 'policy_too_complex'
  | 'policy_compilation_failed'
  | 'internal_error';

export class WalletError extends Error {
  constructor(public readonly code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface WalletPort {
  exists(): Promise<boolean>;
  profiles(): Promise<WalletRegistry>;
  selectWallet(walletId: string): Promise<WalletProfile>;
  generateMnemonic(): Promise<MnemonicPresentation>;
  cancelOnboarding(): Promise<void>;
  createWallet(name: string, credential: string): Promise<void>;
  recoverWallet(name: string, mnemonic: string, credential: string): Promise<void>;
  unlock(credential: string): Promise<void>;
  deleteWallet(): Promise<void>;
  resetRegtestWallet(confirmation: string): Promise<void>;
  snapshot(): Promise<WalletSnapshot>;
  sync(): Promise<WalletSnapshot>;
  createAddress(label: string): Promise<ReceiveAddress>;
  discardAddress(id: number): Promise<void>;
  estimateFees(): Promise<FeeEstimates>;
  setCoinFrozen(outpoint: string, frozen: boolean): Promise<void>;
  preparePayment(recipient: string, amount: Sats, feeRate: FeeRate, coinSelection?: CoinSelection): Promise<PaymentProposal>;
  signAndBroadcast(proposalId: string, credential: string): Promise<{ txid: string; snapshot: WalletSnapshot }>;
  listHardwareDevices(): Promise<HardwareDevice[]>;
  checkHardwareCosigner(cosigner: CosignerDraft): Promise<CosignerHealthCheck>;
  importHardwareCosigner(deviceId: string, label: string): Promise<CosignerDraft>;
  previewMultisig(policy: PolicyDraft): Promise<MultisigPreview>;
  analyzeRecoveryPolicy(template: RecoveryTemplate, cosigners: CosignerDraft[]): Promise<RecoveryPolicyAnalysis>;
  createMultisig(policy: PolicyDraft, credential: string): Promise<MultisigWallet>;
  createRecoveryMultisig(name: string, template: RecoveryTemplate, cosigners: CosignerDraft[], credential: string): Promise<MultisigWallet>;
  multisigWallet(): Promise<MultisigWallet | null>;
  exportMultisig(credential: string): Promise<string>;
  recoveryDrill(encodedBackup: string): Promise<RecoveryDrill>;
  recoverMultisig(encodedBackup: string, credential: string): Promise<MultisigWallet>;
  deleteMultisig(credential: string, confirmation: string): Promise<void>;
  multisigSnapshot(): Promise<WalletSnapshot>;
  syncMultisig(): Promise<WalletSnapshot>;
  createMultisigAddress(label: string): Promise<ReceiveAddress>;
  discardMultisigAddress(id: number): Promise<void>;
  prepareMultisigPayment(recipient: string, amount: Sats, feeRate: FeeRate): Promise<MultisigProposal>;
  multisigProposals(): Promise<MultisigProposal[]>;
  importMultisigProposal(proposalId: string, signedPsbt: string): Promise<MultisigProposal>;
  signMultisigWithHardware(proposalId: string, deviceId: string): Promise<MultisigProposal>;
  broadcastMultisigProposal(proposalId: string, credential: string): Promise<{ txid: string; snapshot: WalletSnapshot }>;
  cancelMultisigProposal(proposalId: string): Promise<void>;
  subscribe(listener: (event: WalletEvent) => void): () => void;
}

export function sats(value: number): Sats {
  if (!Number.isSafeInteger(value) || value < 0) throw new WalletError('invalid_amount', 'Satoshi amount must be a non-negative safe integer.');
  return value as Sats;
}

export function feeRate(value: number): FeeRate {
  if (!Number.isFinite(value) || value <= 0) throw new WalletError('invalid_amount', 'Fee rate must be greater than zero.');
  return value as FeeRate;
}
