import type { ReceiveAddress, Transaction, Utxo } from '$lib/types';
import type { SupportedNetwork } from '$lib/config';
import type { CosignerDraft, PolicyDraft } from '$lib/multisig/policy';

export type Sats = number & { readonly __brand: 'Sats' };
export type FeeRate = number & { readonly __brand: 'SatPerVbyte' };

export type WalletSnapshot = {
  network: SupportedNetwork;
  balance: { confirmed: Sats; pending: Sats; trustedPending: Sats; total: Sats };
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
  label: string;
  amount: Sats;
  fee: Sats;
  feeRate: FeeRate;
  total: Sats;
  selectedOutpoints: string[];
};

export type BroadcastResult = {
  txid: string;
  snapshot: WalletSnapshot;
  syncPending: boolean;
};

export type CoinSelection = { mode: 'auto' } | { mode: 'manual'; outpoints: string[] };
export type AccelerationMethod = 'rbf' | 'cpfp';

export type HardwareDevice = {
  id: string;
  label: string;
  model: string;
  fingerprint: string | null;
  connected: boolean;
  status: 'ready' | 'needs_pin' | 'needs_passphrase' | 'needs_companion' | 'needs_device_unlock' | 'not_ready';
  message: string;
  action: 'import' | 'prompt_pin' | 'confirm_empty_passphrase' | 'retry' | 'none';
};

export type ExternalSignerSource = 'usb' | 'qr' | 'file' | 'manual';
export type ExternalSigner = {
  label: string;
  fingerprint: string;
  xpub: string;
  derivationPath: string;
  source: ExternalSignerSource;
  deviceType: string | null;
};
export type ExternalSignerWallet = {
  version: number;
  name: string;
  signer: ExternalSigner;
  externalDescriptor: string;
  internalDescriptor: string;
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
  inactivityTimeoutMinutes: number;
};
export type CoreNodeConfig = {
  backend: { type: 'local_core' | 'remote_core'; url: string };
  auth: 'cookie' | 'user_pass';
  username: string | null;
  torProxy?: string | null;
};
export type NodeStatus = { connected: boolean; blocks: number; backend: CoreNodeConfig };
export type RecoveryScanSettings = { birthdayHeight: number; gapLimit: number };

export type WalletEvent =
  | { type: 'payment_received'; txid: string; amount: Sats; balance: Sats }
  | { type: 'first_confirmation'; txid: string; balance: Sats }
  | { type: 'transaction_broadcast'; txid: string; balance: Sats }
  | { type: 'wallet_updated'; walletKind: WalletProfile['kind']; snapshot: WalletSnapshot };

export type WalletErrorCode =
  | 'invalid_credential'
  | 'invalid_address'
  | 'invalid_amount'
  | 'insufficient_funds'
  | 'address_not_discardable'
  | 'network_unavailable'
  | 'wallet_locked'
  | 'invalid_inactivity_timeout'
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
  | 'invalid_signer_import'
  | 'import_too_large'
  | 'private_material_rejected'
  | 'invalid_fingerprint'
  | 'invalid_derivation_path'
  | 'wrong_network'
  | 'invalid_node_config'
  | 'hardware_unavailable'
  | 'invalid_hardware_request'
  | 'hardware_pin_rejected'
  | 'hardware_challenge_expired'
  | 'hardware_wallet_selection_required'
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
  | 'invalid_ur'
  | 'backup_too_large'
  | 'backup_mismatch'
  | 'confirmation_mismatch'
  | 'invalid_timeline'
  | 'invalid_decay'
  | 'invalid_expansion'
  | 'invalid_signer_count'
  | 'unknown_signer'
  | 'duplicate_signer'
  | 'recovery_signer_reused'
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
  saveInactivityTimeout(minutes: number): Promise<WalletRegistry>;
  selectWallet(walletId: string): Promise<WalletProfile>;
  generateMnemonic(): Promise<MnemonicPresentation>;
  cancelOnboarding(): Promise<void>;
  createWallet(name: string, credential: string): Promise<void>;
  recoverWallet(name: string, mnemonic: string, credential: string): Promise<void>;
  unlock(credential: string): Promise<void>;
  lock(): Promise<void>;
  deleteWallet(credential: string, confirmation: string): Promise<void>;
  resetRegtestWallet(confirmation: string): Promise<void>;
  nodeConfig(): Promise<CoreNodeConfig>;
  saveNodeConfig(config: CoreNodeConfig, password: string, credential: string): Promise<NodeStatus>;
  testNodeConnection(): Promise<NodeStatus>;
  recoveryScanSettings(): Promise<RecoveryScanSettings>;
  saveRecoveryScanSettings(birthdayHeight: number, gapLimit: number, credential: string): Promise<RecoveryScanSettings>;
  fullRescan(credential: string): Promise<WalletSnapshot>;
  snapshot(): Promise<WalletSnapshot>;
  sync(): Promise<WalletSnapshot>;
  createAddress(label: string): Promise<ReceiveAddress>;
  discardAddress(id: number): Promise<void>;
  estimateFees(): Promise<FeeEstimates>;
  setCoinFrozen(outpoint: string, frozen: boolean): Promise<void>;
  setMultisigCoinFrozen(outpoint: string, frozen: boolean): Promise<void>;
  preparePayment(recipient: string, label: string, amount: Sats, feeRate: FeeRate, coinSelection?: CoinSelection): Promise<PaymentProposal>;
  prepareAcceleration(txid: string, method: AccelerationMethod, feeRate: FeeRate): Promise<PaymentProposal>;
  signAndBroadcast(proposalId: string, credential: string): Promise<BroadcastResult>;
  listHardwareDevices(): Promise<HardwareDevice[]>;
  promptHardwarePin(deviceId: string): Promise<string>;
  sendHardwarePin(challengeId: string, pinPositions: string): Promise<void>;
  checkHardwareCosigner(cosigner: CosignerDraft): Promise<CosignerHealthCheck>;
  importHardwareCosigner(deviceId: string, label: string, allowEmptyPassphrase?: boolean): Promise<CosignerDraft>;
  parseExternalSignerImport(encoded: string, label: string, source: ExternalSignerSource): Promise<ExternalSigner>;
  importHardwareExternalSigner(deviceId: string, label: string, allowEmptyPassphrase?: boolean): Promise<ExternalSigner>;
  createExternalSignerWallet(name: string, signer: ExternalSigner, credential: string): Promise<ExternalSignerWallet>;
  externalSignerWallet(): Promise<ExternalSignerWallet>;
  externalSignerProposals(): Promise<MultisigProposal[]>;
  importExternalSignerProposal(proposalId: string, signedPsbt: string): Promise<MultisigProposal>;
  signExternalWithHardware(proposalId: string, deviceId: string): Promise<MultisigProposal>;
  broadcastExternalSignerProposal(proposalId: string, credential: string): Promise<BroadcastResult>;
  cancelExternalSignerProposal(proposalId: string): Promise<void>;
  previewMultisig(policy: PolicyDraft): Promise<MultisigPreview>;
  analyzeRecoveryPolicy(template: RecoveryTemplate, cosigners: CosignerDraft[]): Promise<RecoveryPolicyAnalysis>;
  createMultisig(policy: PolicyDraft, credential: string): Promise<MultisigWallet>;
  createRecoveryMultisig(name: string, template: RecoveryTemplate, cosigners: CosignerDraft[], credential: string): Promise<MultisigWallet>;
  multisigWallet(): Promise<MultisigWallet | null>;
  exportMultisig(credential: string): Promise<string>;
  exportMultisigBsms(credential: string): Promise<string>;
  savePublicBackup(suggestedFilename: string, content: string): Promise<boolean>;
  printPublicBackup(): Promise<void>;
  inspectMultisigBsms(encodedBackup: string): Promise<RecoveryDrill>;
  recoverMultisigBsms(name: string, encodedBackup: string, credential: string): Promise<MultisigWallet>;
  recoveryDrill(encodedBackup: string): Promise<RecoveryDrill>;
  recoverMultisig(encodedBackup: string, credential: string): Promise<MultisigWallet>;
  deleteMultisig(credential: string, confirmation: string): Promise<void>;
  multisigSnapshot(): Promise<WalletSnapshot>;
  syncMultisig(): Promise<WalletSnapshot>;
  createMultisigAddress(label: string): Promise<ReceiveAddress>;
  discardMultisigAddress(id: number): Promise<void>;
  prepareMultisigPayment(recipient: string, label: string, amount: Sats, feeRate: FeeRate, coinSelection?: CoinSelection): Promise<MultisigProposal>;
  prepareMultisigAcceleration(txid: string, method: AccelerationMethod, feeRate: FeeRate): Promise<MultisigProposal>;
  multisigProposals(): Promise<MultisigProposal[]>;
  importMultisigProposal(proposalId: string, signedPsbt: string): Promise<MultisigProposal>;
  signMultisigWithHardware(proposalId: string, deviceId: string): Promise<MultisigProposal>;
  broadcastMultisigProposal(proposalId: string, credential: string): Promise<BroadcastResult>;
  cancelMultisigProposal(proposalId: string): Promise<void>;
  savePsbt(suggestedFilename: string, psbt: string): Promise<boolean>;
  encodePsbtUr(psbt: string, fragmentBytes?: number): Promise<string[]>;
  decodePsbtUr(frames: string[]): Promise<string>;
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
