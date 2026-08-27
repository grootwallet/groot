import type { ReceiveAddress } from '$lib/types';
import type { CosignerDraft, PolicyDraft } from '$lib/multisig/policy';
import type {
  HardwareDevice,
  ExternalSigner,
  ExternalSignerBackup,
  ExternalSignerSource,
  ExternalSignerWallet,
  CosignerHealthCheck,
  HardwareHealthCheckRecord,
  PolicyVerificationAddress,
  SavedFileResult,
  PendingPdfExport,
  SignerPolicyVerification
} from './hardware';
import type {
  MultisigPreview,
  MultisigCreation,
  MultisigProposal,
  MultisigSetupDraft,
  MultisigWallet,
  RecoveryDrill,
  RecoveryPolicyAnalysis,
  RecoveryTemplate
} from './multisig';
import type {
  CoreNodeConfig,
  MnemonicPresentation,
  WalletProfileCompatibility,
  RuntimePlatform,
  NodeStatus,
  NetworkSetupSource,
  PayjoinUriInspection,
  RecoveryScanSettings,
  RecoveryScanStatus,
  SupplementalEntropyInput,
  WalletEvent,
  WalletProfile,
  WalletRegistry,
  WalletSelection,
  WalletSyncSource,
  WalletSyncStatus
} from './runtime';
import type {
  AccelerationMethod,
  BroadcastResult,
  CoinSelection,
  CoinSelectionPreview,
  FeeEstimates,
  MaxSpend,
  FeeRate,
  PaymentProposal,
  Sats,
  WalletSnapshot
} from './transactions';
import type { PaymentDraft } from '../payment-draft';
import type { WalletCoordinationPort } from './coordination';

export interface WalletProfilesPort {
  runtimePlatform(): Promise<RuntimePlatform>;
  exists(): Promise<boolean>;
  profiles(): Promise<WalletRegistry>;
  profileCompatibility(): Promise<WalletProfileCompatibility>;
  renameWallet(name: string): Promise<WalletProfile>;
  saveInactivityTimeout(minutes: number): Promise<WalletRegistry>;
  session(): Promise<WalletSelection>;
  selectWallet(walletId: string): Promise<WalletSelection>;
  generateMnemonic(supplementalEntropy?: SupplementalEntropyInput): Promise<MnemonicPresentation>;
  cancelOnboarding(): Promise<void>;
  createWallet(name: string, credential: string, backupVerified: boolean): Promise<void>;
  verifyBackup(credential: string): Promise<boolean>;
  revealAndVerifyBackup(credential: string): Promise<boolean>;
  recoverWallet(name: string, credential: string): Promise<void>;
  unlock(credential: string): Promise<void>;
  lock(): Promise<void>;
  lockAll(): Promise<void>;
  deleteWallet(credential: string, confirmation: string): Promise<void>;
  resetRegtestWallet(confirmation: string): Promise<void>;
}

export interface WalletNetworkPort {
  networkSetupSources(): Promise<NetworkSetupSource[]>;
  adoptNetworkSetup(sourceWalletId: string, credential: string): Promise<NodeStatus>;
  nodeConfig(): Promise<CoreNodeConfig>;
  saveNodeConfig(config: CoreNodeConfig, password: string, credential: string): Promise<NodeStatus>;
  testNodeConnection(): Promise<NodeStatus>;
  syncSource(): Promise<WalletSyncSource>;
  syncStatus(): Promise<WalletSyncStatus | null>;
  saveSyncSource(source: WalletSyncSource, credential: string): Promise<WalletSyncSource>;
  inspectPayjoinUri(value: string): Promise<PayjoinUriInspection>;
  recoveryScanSettings(): Promise<RecoveryScanSettings>;
  saveRecoveryScanSettings(
    birthdayHeight: number,
    gapLimit: number,
    credential: string
  ): Promise<RecoveryScanSettings>;
  recoveryScanStatus(): Promise<RecoveryScanStatus>;
  fullRescan(credential: string): Promise<WalletSnapshot>;
  cancelFullRescan(): Promise<RecoveryScanStatus>;
}

export interface WalletSnapshotPort {
  snapshot(): Promise<WalletSnapshot>;
  sync(): Promise<WalletSnapshot>;
  cancelSync(): Promise<void>;
  multisigSnapshot(): Promise<WalletSnapshot>;
  syncMultisig(): Promise<WalletSnapshot>;
}

export interface WalletTransactionsPort {
  paymentDraft(): Promise<PaymentDraft | null>;
  savePaymentDraft(draft: PaymentDraft): Promise<PaymentDraft>;
  clearPaymentDraft(): Promise<void>;
  createAddress(labels: string[]): Promise<ReceiveAddress>;
  discardAddress(id: number): Promise<void>;
  estimateFees(): Promise<FeeEstimates>;
  maxSpend(recipient: string, feeRate: FeeRate, coinSelection?: CoinSelection): Promise<MaxSpend>;
  maxMultisigSpend(
    recipient: string,
    feeRate: FeeRate,
    coinSelection?: CoinSelection
  ): Promise<MaxSpend>;
  setCoinFrozen(outpoint: string, frozen: boolean): Promise<void>;
  setMultisigCoinFrozen(outpoint: string, frozen: boolean): Promise<void>;
  previewCoinSelection(outpoints: string[], amount: Sats): Promise<CoinSelectionPreview>;
  previewMultisigCoinSelection(outpoints: string[], amount: Sats): Promise<CoinSelectionPreview>;
  preparePayment(
    recipient: string,
    labels: string[],
    amount: Sats,
    feeRate: FeeRate,
    coinSelection?: CoinSelection
  ): Promise<PaymentProposal>;
  paymentProposals(): Promise<PaymentProposal[]>;
  cancelPaymentProposal(proposalId: string): Promise<void>;
  prepareAcceleration(
    txid: string,
    method: AccelerationMethod,
    feeRate: FeeRate
  ): Promise<PaymentProposal>;
  quoteRbf(txid: string, feeRate?: FeeRate): Promise<import('./transactions').AccelerationQuote>;
  signAndBroadcast(proposalId: string, credential: string): Promise<BroadcastResult>;
}

export interface WalletHardwarePort {
  cancelHardwareOperations(): Promise<void>;
  listHardwareDevices(): Promise<HardwareDevice[]>;
  listHardwareDevicesForTypes(deviceTypes: string[]): Promise<HardwareDevice[]>;
  findSavedHardwareDevice(signer: {
    deviceType?: string | null;
    fingerprint: string;
    derivationPath: string;
    xpub: string;
  }): Promise<HardwareDevice>;
  promptHardwarePin(deviceId: string): Promise<string>;
  sendHardwarePin(challengeId: string, pinPositions: string): Promise<void>;
  checkHardwareCosigner(cosigner: CosignerDraft, deviceId: string): Promise<CosignerHealthCheck>;
  checkHardwareExternalSigner(
    signer: ExternalSigner,
    deviceId: string
  ): Promise<CosignerHealthCheck>;
  hardwareHealthChecks(): Promise<HardwareHealthCheckRecord[]>;
  multisigSignerPolicyVerifications(): Promise<SignerPolicyVerification[]>;
  multisigPolicyVerificationAddress(): Promise<PolicyVerificationAddress>;
  previewMultisigPolicyVerificationAddress(policy: PolicyDraft): Promise<PolicyVerificationAddress>;
  verifyMultisigSignerPolicy(
    deviceId: string,
    signerFingerprint: string
  ): Promise<SignerPolicyVerification>;
  verifyMultisigDraftSignerPolicy(
    policy: PolicyDraft,
    deviceId: string,
    signerFingerprint: string
  ): Promise<SignerPolicyVerification>;
  acknowledgeColdcardPolicy(signerFingerprint: string): Promise<SignerPolicyVerification>;
  importHardwareCosigner(
    deviceId: string,
    label: string,
    allowEmptyPassphrase?: boolean
  ): Promise<CosignerDraft>;
  parseExternalSignerImport(
    encoded: string,
    label: string,
    source: ExternalSignerSource
  ): Promise<ExternalSigner>;
  importHardwareExternalSigner(
    deviceId: string,
    label: string,
    allowEmptyPassphrase?: boolean
  ): Promise<ExternalSigner>;
  createExternalSignerWallet(
    name: string,
    signer: ExternalSigner,
    credential: string
  ): Promise<ExternalSignerWallet>;
  externalSignerWallet(): Promise<ExternalSignerWallet>;
  renameExternalSigner(label: string): Promise<ExternalSignerWallet>;
  exportExternalSignerDescriptor(credential: string): Promise<ExternalSignerBackup>;
  externalSignerProposals(): Promise<MultisigProposal[]>;
  importExternalSignerProposal(
    proposalId: string,
    reviewedPsbt: string,
    signedPsbt: string
  ): Promise<MultisigProposal>;
  discardExternalSignerSignature(
    proposalId: string,
    reviewedPsbt: string
  ): Promise<MultisigProposal>;
  signExternalWithHardware(
    proposalId: string,
    deviceId: string,
    reviewedPsbt: string
  ): Promise<MultisigProposal>;
  broadcastExternalSignerProposal(
    proposalId: string,
    reviewedPsbt: string,
    credential: string
  ): Promise<BroadcastResult>;
  cancelExternalSignerProposal(proposalId: string): Promise<void>;
  verifyExternalAddress(deviceId: string, addressId: number): Promise<ReceiveAddress>;
}

export interface WalletMultisigPort {
  multisigSetupDraft(): Promise<MultisigSetupDraft | null>;
  saveMultisigSetupDraft(draft: MultisigSetupDraft): Promise<MultisigSetupDraft>;
  discardMultisigSetupDraft(): Promise<void>;
  previewMultisig(policy: PolicyDraft): Promise<MultisigPreview>;
  analyzeRecoveryPolicy(
    template: RecoveryTemplate,
    cosigners: CosignerDraft[]
  ): Promise<RecoveryPolicyAnalysis>;
  createMultisig(
    policy: PolicyDraft,
    credential: string,
    networkSetupSourceWalletId?: string
  ): Promise<MultisigCreation>;
  createRecoveryMultisig(
    name: string,
    template: RecoveryTemplate,
    cosigners: CosignerDraft[],
    credential: string,
    networkSetupSourceWalletId?: string
  ): Promise<MultisigCreation>;
  multisigWallet(): Promise<MultisigWallet | null>;
  renameMultisigSigner(signerId: string, label: string): Promise<MultisigWallet>;
  exportMultisig(credential: string): Promise<string>;
  exportMultisigBsms(credential: string): Promise<string>;
  savePublicBackup(suggestedFilename: string, content: string): Promise<SavedFileResult>;
  preparePublicBackupPdf(suggestedFilename: string): Promise<PendingPdfExport>;
  savePublicBackupPdf(saveToken: string, markup: string): Promise<SavedFileResult>;
  inspectMultisigBsms(encodedBackup: string): Promise<RecoveryDrill>;
  recoverMultisigBsms(
    name: string,
    encodedBackup: string,
    credential: string
  ): Promise<MultisigWallet>;
  recoveryDrill(encodedBackup: string): Promise<RecoveryDrill>;
  multisigRecoveryDrillStatus(): Promise<boolean>;
  recoverMultisig(encodedBackup: string, credential: string): Promise<MultisigWallet>;
  deleteMultisig(credential: string, confirmation: string): Promise<void>;
  createMultisigAddress(labels: string[]): Promise<ReceiveAddress>;
  claimObservedMultisigAddress(outpoint: string, label: string): Promise<ReceiveAddress>;
  discardMultisigAddress(id: number): Promise<void>;
  verifyMultisigAddress(deviceId: string, addressId: number): Promise<ReceiveAddress>;
  prepareMultisigPayment(
    recipient: string,
    labels: string[],
    amount: Sats,
    feeRate: FeeRate,
    coinSelection?: CoinSelection
  ): Promise<MultisigProposal>;
  prepareMultisigPolicyRenewal(
    outpoint: string,
    labels: string[],
    feeRate: FeeRate
  ): Promise<MultisigProposal>;
  prepareMultisigDelayedSpend(
    outpoint: string,
    recipient: string,
    labels: string[],
    feeRate: FeeRate
  ): Promise<MultisigProposal>;
  prepareMultisigAcceleration(
    txid: string,
    method: AccelerationMethod,
    feeRate: FeeRate
  ): Promise<MultisigProposal>;
  multisigProposals(): Promise<MultisigProposal[]>;
  importMultisigProposal(
    proposalId: string,
    reviewedPsbt: string,
    signedPsbt: string
  ): Promise<MultisigProposal>;
  discardMultisigSignature(
    proposalId: string,
    reviewedPsbt: string,
    signerFingerprint: string
  ): Promise<MultisigProposal>;
  signMultisigWithHardware(
    proposalId: string,
    deviceId: string,
    reviewedPsbt: string
  ): Promise<MultisigProposal>;
  broadcastMultisigProposal(
    proposalId: string,
    reviewedPsbt: string,
    credential: string
  ): Promise<BroadcastResult>;
  cancelMultisigProposal(proposalId: string): Promise<void>;
}

export interface WalletFileTransportPort {
  savePsbt(suggestedFilename: string, psbt: string): Promise<SavedFileResult>;
  revealSavedFile(revealToken: string): Promise<void>;
  encodePsbtUr(psbt: string, fragmentBytes?: number): Promise<string[]>;
  decodePsbtUr(frames: string[]): Promise<string>;
  openTransactionExplorer(txid: string): Promise<void>;
  exportLabels(): Promise<import('./transactions').LabelExportResult>;
  importLabels(): Promise<import('./transactions').LabelImportResult | null>;
}

export interface WalletEventsPort {
  subscribe(listener: (event: WalletEvent) => void): () => void;
}

export interface WalletPort
  extends
    WalletProfilesPort,
    WalletNetworkPort,
    WalletSnapshotPort,
    WalletTransactionsPort,
    WalletHardwarePort,
    WalletMultisigPort,
    WalletCoordinationPort,
    WalletFileTransportPort,
    WalletEventsPort {}
