import { invoke } from '@tauri-apps/api/core';
import type { ReceiveAddress } from '$lib/types';
import type { SwitchableNetwork } from '$lib/config';
import {
  WalletError,
  walletErrorCode,
  type FeeEstimates,
  type FeeRate,
  type CoinSelection,
  type BroadcastResult,
  type PaymentProposal,
  type Sats,
  type WalletEvent,
  type WalletPort,
  type WalletSnapshot
} from './contracts';
import type {
  MnemonicPresentation,
  SupplementalEntropyInput,
  WalletProfile,
  WalletRegistry,
  RuntimePlatform,
  WalletSelection
} from './contracts';
import type {
  CosignerHealthCheck,
  HardwareDevice,
  HardwareHealthCheckRecord,
  MultisigPreview,
  MultisigCreation,
  MultisigProposal,
  MultisigWallet
} from './contracts';
import type { RecoveryDrill, RecoveryPolicyAnalysis, RecoveryTemplate } from './contracts';
import type {
  ExternalSigner,
  ExternalSignerBackup,
  ExternalSignerSource,
  ExternalSignerWallet,
  SavedFileResult,
  PendingPdfExport
} from './contracts';
import type {
  CoreNodeConfig,
  NodeStatus,
  PaymentRequestInspection,
  WalletSyncSource,
  WalletSyncStatus
} from './contracts';
import type { PolicyDraft } from '$lib/multisig/policy';
import { coalesceNotificationEvents } from './notification-policy';
import {
  multisigVerificationTimestampForDisplay,
  multisigVerificationTimestampForStorage
} from './multisig-setup';
import type { PaymentDraft } from './payment-draft';

type BackendError = {
  code?: string;
  message?: string;
  existingWalletId?: string;
  details?: import('./contracts').WalletErrorDetails;
};
type NotificationEnvelope = { id: string; event: WalletEvent };
const NOTIFICATION_BATCH_SIZE = 256;
const MAX_NOTIFICATION_BATCHES_PER_DRAIN = 32;

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args);
  } catch (error) {
    const backend = error as BackendError;
    throw new WalletError(
      walletErrorCode(backend?.code),
      backend?.message ?? (typeof error === 'string' ? error : 'The wallet command failed.'),
      typeof backend?.existingWalletId === 'string' ? backend.existingWalletId : null,
      backend?.details && typeof backend.details === 'object' ? backend.details : null
    );
  }
}

function normalizeTimestamp(value: string | null): string | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : value;
}

function normalizeAddress(address: ReceiveAddress): ReceiveAddress {
  return {
    ...address,
    labels: address.labels?.length ? address.labels : [address.label],
    created: normalizeTimestamp(address.created) ?? address.created,
    hardwareVerifiedAt: normalizeTimestamp(address.hardwareVerifiedAt ?? null)
  };
}

function normalizeSnapshot(snapshot: WalletSnapshot): WalletSnapshot {
  return {
    ...snapshot,
    syncedAt: normalizeTimestamp(snapshot.syncedAt),
    chainTip: {
      ...snapshot.chainTip,
      observedAt: normalizeTimestamp(snapshot.chainTip.observedAt)
    },
    receiveAddresses: snapshot.receiveAddresses.map(normalizeAddress),
    transactions: snapshot.transactions.map((transaction) => ({
      ...transaction,
      date: normalizeTimestamp(transaction.date) ?? transaction.date
    }))
  };
}

function normalizeMultisigSetupDraft(
  draft: import('./contracts').MultisigSetupDraft
): import('./contracts').MultisigSetupDraft {
  return {
    ...draft,
    policyVerifications: draft.policyVerifications.map((verification) => ({
      ...verification,
      verifiedAt: multisigVerificationTimestampForDisplay(verification.verifiedAt)
    }))
  };
}

function serializeMultisigSetupDraft(
  draft: import('./contracts').MultisigSetupDraft
): import('./contracts').MultisigSetupDraft {
  return {
    ...draft,
    policyVerifications: draft.policyVerifications.map((verification) => {
      const verifiedAt = multisigVerificationTimestampForStorage(verification.verifiedAt);
      if (!verifiedAt) {
        throw new WalletError(
          'wallet_corrupt',
          'The hardware-policy verification time is invalid. Verify that signer policy again.'
        );
      }
      return { ...verification, verifiedAt };
    })
  };
}

export class TauriWalletAdapter implements WalletPort {
  #listeners = new Set<(event: WalletEvent) => void>();
  #selectedWalletId: string | null = null;
  #selectedWalletKind: WalletProfile['kind'] | null = null;
  #generation = 0;
  #registryRequest = 0;
  #notificationDrains = new Map<string, Promise<void>>();
  #hardwareListRequest: Promise<HardwareDevice[]> | null = null;
  #typedHardwareListRequests = new Map<string, Promise<HardwareDevice[]>>();

  paymentDraft() {
    return command<PaymentDraft | null>('payment_draft');
  }
  diagnostics() {
    return command<import('./contracts').DiagnosticRecord[]>('diagnostics_list');
  }
  exportDiagnostics(format: 'json' | 'csv') {
    return command<import('./contracts').SavedFileResult>('diagnostics_export', { format });
  }
  savePaymentDraft(draft: PaymentDraft) {
    return command<PaymentDraft>('payment_draft_save', { draft });
  }
  clearPaymentDraft() {
    return command<void>('payment_draft_clear');
  }

  runtimePlatform() {
    return command<RuntimePlatform>('runtime_platform');
  }
  async switchNetwork(network: SwitchableNetwork) {
    await command<void>('bitcoin_network_switch', { selectedNetwork: network });
  }

  exists() {
    return command<boolean>('wallet_exists');
  }
  async profiles() {
    const generation = this.#generation;
    const request = ++this.#registryRequest;
    const registry = await command<WalletRegistry>('wallet_profiles');
    if (generation === this.#generation && request === this.#registryRequest) {
      if (this.#selectedWalletId !== registry.selectedWalletId) this.#generation++;
      this.#selectedWalletId = registry.selectedWalletId;
      this.#selectedWalletKind =
        registry.wallets.find((profile) => profile.id === registry.selectedWalletId)?.kind ?? null;
    }
    return registry;
  }
  async renameWallet(name: string) {
    const profile = await command<WalletProfile>('wallet_rename', { name });
    this.#emit({ type: 'wallet_profile_updated', profile });
    return profile;
  }
  saveInactivityTimeout(minutes: number) {
    return command<WalletRegistry>('wallet_inactivity_timeout_save', { minutes });
  }
  async session() {
    const generation = this.#generation;
    const selection = await command<WalletSelection>('wallet_session');
    if (generation === this.#generation && !selection.unlocked) this.#generation++;
    return selection;
  }
  async selectWallet(walletId: string) {
    const generation = ++this.#generation;
    const selection = await command<WalletSelection>('wallet_select', { walletId });
    if (generation === this.#generation) {
      this.#selectedWalletId = selection.profile.id;
      this.#selectedWalletKind = selection.profile.kind;
    }
    return selection;
  }
  async generateMnemonic(
    supplementalEntropy?: SupplementalEntropyInput
  ): Promise<MnemonicPresentation> {
    const backupVerified = await command<boolean>('wallet_generate_mnemonic', {
      supplementalEntropy: supplementalEntropy ?? null
    });
    return { mode: 'native', backupVerified };
  }
  cancelOnboarding(preserveMainnetAdmission = false) {
    this.#generation++;
    return command<void>('wallet_cancel_onboarding', { preserveMainnetAdmission });
  }
  createWallet(
    name: string,
    credential: string,
    _backupVerified: boolean,
    networkSetupSourceWalletId?: string
  ) {
    this.#generation++;
    return command<import('./contracts').SoftwareWalletCreation>('wallet_create', {
      name,
      credential,
      networkSetupSourceWalletId
    });
  }
  verifyBackup(credential: string) {
    return command<boolean>('wallet_verify_backup', { credential });
  }
  revealAndVerifyBackup(credential: string) {
    return command<boolean>('wallet_reveal_and_verify_backup', { credential });
  }
  recoverWallet(name: string, credential: string) {
    this.#generation++;
    return command<void>('wallet_recover', { name, credential });
  }
  profileCompatibility() {
    return command<import('./contracts').WalletProfileCompatibility>(
      'wallet_profile_compatibility'
    );
  }
  unlock(credential: string) {
    this.#generation++;
    return command<void>('wallet_unlock', { credential });
  }
  lock() {
    this.#generation++;
    return command<void>('wallet_lock');
  }
  deleteWallet(credential: string, confirmation: string) {
    this.#generation++;
    return command<void>('wallet_delete', { credential, confirmation });
  }
  resetRegtestWallet(confirmation: string) {
    this.#generation++;
    return command<void>('wallet_reset_regtest', { confirmation });
  }
  nodeConfig() {
    return command<CoreNodeConfig>('node_config');
  }
  publicNetworkStatus() {
    return command<import('./contracts').PublicNetworkStatus>('network_public_status');
  }
  admitMainnetCore(
    config: CoreNodeConfig,
    password: string,
    purpose: 'open_existing_wallet' | 'create_new_wallet'
  ) {
    return command<NodeStatus>('mainnet_core_admit', { config, password, purpose });
  }
  networkSetupSources() {
    return command<import('./contracts').NetworkSetupSource[]>('network_setup_sources');
  }
  adoptNetworkSetup(sourceWalletId: string, credential: string) {
    return command<NodeStatus>('network_setup_adopt', { sourceWalletId, credential });
  }
  configureManagedNode(credential: string) {
    return command<NodeStatus>('managed_node_configure', { credential });
  }
  saveNodeConfig(config: CoreNodeConfig, password: string, credential: string) {
    return command<NodeStatus>('node_config_save', { config, password, credential });
  }
  testNodeConnection() {
    return command<NodeStatus>('node_connection_test');
  }
  syncSource() {
    return command<WalletSyncSource>('wallet_sync_source');
  }
  syncStatus() {
    return command<WalletSyncStatus | null>('wallet_sync_status');
  }
  saveSyncSource(source: WalletSyncSource, credential: string) {
    return command<WalletSyncSource>('wallet_sync_source_save', { source, credential });
  }
  inspectPaymentRequest(value: string) {
    return command<PaymentRequestInspection>('payment_request_inspect', { value });
  }
  recoveryScanSettings() {
    return command<import('./contracts').RecoveryScanSettings>('recovery_scan_settings');
  }
  saveRecoveryScanSettings(birthdayHeight: number, gapLimit: number, credential: string) {
    return command<import('./contracts').RecoveryScanSettings>('recovery_scan_settings_save', {
      birthdayHeight,
      gapLimit,
      credential
    });
  }
  recoveryScanStatus() {
    return command<import('./contracts').RecoveryScanStatus>('recovery_scan_status');
  }
  async fullRescan(credential: string) {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const snapshot = normalizeSnapshot(
      await command<WalletSnapshot>('wallet_full_rescan', { credential })
    );
    if (walletId && this.#isCurrent(walletId, generation)) {
      this.#scheduleNotifications(false, walletId, generation);
      this.#emit({ type: 'wallet_updated', walletId, walletKind: 'single_key', snapshot });
    }
    return snapshot;
  }
  cancelFullRescan() {
    return command<import('./contracts').RecoveryScanStatus>('wallet_full_rescan_cancel');
  }
  async snapshot() {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const snapshot = normalizeSnapshot(await command<WalletSnapshot>('wallet_snapshot'));
    this.#scheduleNotifications(false, walletId, generation);
    return snapshot;
  }
  async overview(walletId: string) {
    const generation = this.#generation;
    const overview = await command<import('./contracts').WalletOverview>('wallet_overview', {
      walletId
    });
    if (!this.#isCurrent(walletId, generation))
      throw new WalletError('wallet_selection_changed', 'The selected wallet changed.');
    if (this.#selectedWalletKind)
      this.#scheduleNotifications(this.#selectedWalletKind === 'multisig', walletId, generation);
    return {
      ...overview,
      syncedAt: normalizeTimestamp(overview.syncedAt),
      chainTip: {
        ...overview.chainTip,
        observedAt: normalizeTimestamp(overview.chainTip.observedAt)
      },
      transactions: overview.transactions.map((tx) => ({
        ...tx,
        date: normalizeTimestamp(tx.date) ?? tx.date
      }))
    };
  }
  async activity(request: import('./contracts').ActivityRequest) {
    const generation = this.#generation;
    const page = await command<import('./contracts').ActivityPage>('wallet_activity', { request });
    if (!this.#isCurrent(request.walletId, generation))
      throw new WalletError('wallet_selection_changed', 'The selected wallet changed.');
    return {
      ...page,
      transactions: page.transactions.map((tx) => ({
        ...tx,
        date: normalizeTimestamp(tx.date) ?? tx.date
      }))
    };
  }
  async sync(automatic = false) {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const snapshot = normalizeSnapshot(await command<WalletSnapshot>('wallet_sync', { automatic }));
    if (walletId && this.#isCurrent(walletId, generation)) {
      this.#scheduleNotifications(false, walletId, generation);
      this.#emit({ type: 'wallet_updated', walletId, walletKind: 'single_key', snapshot });
    }
    return snapshot;
  }
  cancelSync() {
    return command<void>('wallet_sync_cancel');
  }
  createAddress(labels: string[]) {
    return command<ReceiveAddress>('address_create', { labels }).then(normalizeAddress);
  }
  discardAddress(id: number) {
    return command<void>('address_discard', { id });
  }
  setCoinFrozen(outpoint: string, frozen: boolean) {
    return command<void>('coin_set_frozen', { outpoint, frozen });
  }
  setMultisigCoinFrozen(outpoint: string, frozen: boolean) {
    return command<void>('multisig_coin_set_frozen', { outpoint, frozen });
  }
  previewCoinSelection(outpoints: string[], amount: Sats) {
    return command<import('./contracts').CoinSelectionPreview>('coin_selection_preview', {
      outpoints,
      amount
    });
  }
  previewMultisigCoinSelection(outpoints: string[], amount: Sats) {
    return command<import('./contracts').CoinSelectionPreview>('multisig_coin_selection_preview', {
      outpoints,
      amount
    });
  }
  estimateFees() {
    return command<FeeEstimates>('fees_estimate');
  }
  maxSpend(recipient: string, feeRate: FeeRate, coinSelection: CoinSelection = { mode: 'auto' }) {
    return command<import('./contracts').MaxSpend>('tx_max_spend', {
      recipient,
      feeRate: String(feeRate),
      coinSelection
    });
  }
  maxMultisigSpend(
    recipient: string,
    feeRate: FeeRate,
    coinSelection: CoinSelection = { mode: 'auto' }
  ) {
    return command<import('./contracts').MaxSpend>('multisig_tx_max_spend', {
      recipient,
      feeRate: String(feeRate),
      coinSelection
    });
  }
  preparePayment(
    recipient: string,
    labels: string[],
    amount: Sats,
    feeRate: FeeRate,
    coinSelection: CoinSelection = { mode: 'auto' }
  ) {
    return command<PaymentProposal>('tx_prepare', {
      recipient,
      labels,
      amount,
      feeRate: String(feeRate),
      coinSelection
    });
  }
  paymentProposals() {
    return command<PaymentProposal[]>('tx_proposals');
  }
  cancelPaymentProposal(proposalId: string) {
    return command<void>('tx_proposal_cancel', { proposalId });
  }
  prepareAcceleration(
    txid: string,
    method: import('./contracts').AccelerationMethod,
    feeRate: FeeRate
  ) {
    return command<PaymentProposal>('tx_acceleration_prepare', {
      txid,
      method,
      feeRate: String(feeRate)
    });
  }
  quoteRbf(txid: string, feeRate?: FeeRate) {
    return command<import('./contracts').AccelerationQuote>('rbf_acceleration_quote', {
      walletId: this.#selectedWalletId,
      txid,
      feeRate: feeRate == null ? null : String(feeRate)
    });
  }
  quoteCpfp(txid: string, feeRate?: FeeRate) {
    return command<import('./contracts').CpfpAccelerationQuote>('cpfp_acceleration_quote', {
      walletId: this.#selectedWalletId,
      txid,
      feeRate: feeRate == null ? null : String(feeRate)
    });
  }
  async signAndBroadcast(proposalId: string, credential: string) {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const result = await command<BroadcastResult>('tx_sign_and_broadcast', {
      proposalId,
      credential
    });
    result.snapshot = normalizeSnapshot(result.snapshot);
    this.#scheduleNotifications(false, walletId, generation);
    return result;
  }
  openTransactionExplorer(txid: string) {
    return command<void>('transaction_explorer_open', { txid });
  }
  exportLabels() {
    return command<import('./contracts').LabelExportResult>('bip329_labels_export');
  }
  importLabels() {
    return command<import('./contracts').LabelImportResult | null>('bip329_labels_import');
  }
  cancelHardwareOperations(preserveMainnetAdmission = false) {
    this.#hardwareListRequest = null;
    this.#typedHardwareListRequests.clear();
    return command<void>('hardware_cancel_operations', { preserveMainnetAdmission });
  }
  listHardwareDevices() {
    if (this.#hardwareListRequest) return this.#hardwareListRequest;
    const request = command<HardwareDevice[]>('hardware_list').finally(() => {
      if (this.#hardwareListRequest === request) this.#hardwareListRequest = null;
    });
    this.#hardwareListRequest = request;
    return request;
  }
  listHardwareDevicesForTypes(deviceTypes: string[]) {
    const normalized = [...new Set(deviceTypes.map((type) => type.trim().toLowerCase()))].sort();
    const key = normalized.join(',');
    const active = this.#typedHardwareListRequests.get(key);
    if (active) return active;
    const request = command<HardwareDevice[]>('hardware_list_for_device_types', {
      deviceTypes: normalized
    }).finally(() => {
      if (this.#typedHardwareListRequests.get(key) === request)
        this.#typedHardwareListRequests.delete(key);
    });
    this.#typedHardwareListRequests.set(key, request);
    return request;
  }
  findSavedHardwareDevice(signer: {
    deviceType?: string | null;
    fingerprint: string;
    derivationPath: string;
    xpub: string;
  }) {
    if (!signer.deviceType)
      throw new WalletError(
        'hardware_unavailable',
        'This saved signer has no interactive USB device type.'
      );
    return command<HardwareDevice>('hardware_find_saved_device', {
      deviceType: signer.deviceType,
      fingerprint: signer.fingerprint,
      derivationPath: signer.derivationPath,
      accountXpub: signer.xpub
    });
  }
  promptHardwarePin(deviceId: string) {
    return command<string>('hardware_prompt_pin', { deviceId });
  }
  sendHardwarePin(challengeId: string, pinPositions: string) {
    return command<void>('hardware_send_pin', { challengeId, pinPositions });
  }
  async checkHardwareCosigner(
    cosigner: PolicyDraft['cosigners'][number],
    deviceId: string,
    draft = false
  ) {
    const result = await command<CosignerHealthCheck>('hardware_check_cosigner', {
      cosigner,
      deviceId,
      draft
    });
    return { ...result, checkedAt: normalizeTimestamp(result.checkedAt) ?? result.checkedAt };
  }
  async checkHardwareExternalSigner(signer: ExternalSigner, deviceId: string) {
    const result = await command<CosignerHealthCheck>('hardware_check_external_signer', {
      signer,
      deviceId
    });
    return { ...result, checkedAt: normalizeTimestamp(result.checkedAt) ?? result.checkedAt };
  }
  async hardwareHealthChecks() {
    const results = await command<HardwareHealthCheckRecord[]>('hardware_health_checks');
    return results.map((result) => ({
      ...result,
      checkedAt: normalizeTimestamp(result.checkedAt) ?? result.checkedAt
    }));
  }
  async multisigSignerPolicyVerifications() {
    const results = await command<import('./contracts').SignerPolicyVerification[]>(
      'multisig_signer_policy_verifications'
    );
    return results.map((result) => ({
      ...result,
      verifiedAt: normalizeTimestamp(result.verifiedAt) ?? result.verifiedAt
    }));
  }
  multisigPolicyVerificationAddress() {
    return command<import('./contracts').PolicyVerificationAddress>(
      'multisig_policy_verification_address'
    );
  }
  previewMultisigPolicyVerificationAddress(policy: PolicyDraft) {
    return command<import('./contracts').PolicyVerificationAddress>(
      'multisig_draft_policy_verification_address',
      { policy }
    );
  }
  async verifyMultisigSignerPolicy(deviceId: string, signerFingerprint: string) {
    const result = await command<import('./contracts').SignerPolicyVerification>(
      'hardware_verify_multisig_policy',
      { deviceId, signerFingerprint }
    );
    return { ...result, verifiedAt: normalizeTimestamp(result.verifiedAt) ?? result.verifiedAt };
  }
  async verifyMultisigDraftSignerPolicy(
    policy: PolicyDraft,
    deviceId: string,
    signerFingerprint: string
  ) {
    const result = await command<import('./contracts').SignerPolicyVerification>(
      'hardware_verify_multisig_draft_policy',
      { policy, deviceId, signerFingerprint }
    );
    return { ...result, verifiedAt: normalizeTimestamp(result.verifiedAt) ?? result.verifiedAt };
  }
  async acknowledgeColdcardPolicy(signerFingerprint: string) {
    const result = await command<import('./contracts').SignerPolicyVerification>(
      'multisig_acknowledge_coldcard_policy',
      { signerFingerprint }
    );
    return { ...result, verifiedAt: normalizeTimestamp(result.verifiedAt) ?? result.verifiedAt };
  }
  importHardwareCosigner(deviceId: string, label: string, allowEmptyPassphrase = false) {
    return command<import('$lib/multisig/policy').CosignerDraft>('hardware_import_cosigner', {
      deviceId,
      label,
      allowEmptyPassphrase
    });
  }
  parseExternalSignerImport(encoded: string, label: string, source: ExternalSignerSource) {
    return command<ExternalSigner>('external_signer_parse_import', { encoded, label, source });
  }
  importHardwareExternalSigner(deviceId: string, label: string, allowEmptyPassphrase = false) {
    return command<ExternalSigner>('hardware_import_external_signer', {
      deviceId,
      label,
      allowEmptyPassphrase
    });
  }
  createExternalSignerWallet(name: string, signer: ExternalSigner, credential: string) {
    this.#generation++;
    return command<ExternalSignerWallet>('external_signer_create', { name, signer, credential });
  }
  externalSignerWallet() {
    return command<ExternalSignerWallet>('external_signer_wallet');
  }
  renameExternalSigner(label: string) {
    return command<ExternalSignerWallet>('external_signer_rename', { label });
  }
  exportExternalSignerDescriptor(credential: string) {
    return command<ExternalSignerBackup>('external_signer_export_descriptor', { credential });
  }
  externalSignerProposals() {
    return command<MultisigProposal[]>('external_signer_proposals');
  }
  importExternalSignerProposal(proposalId: string, reviewedPsbt: string, signedPsbt: string) {
    return command<MultisigProposal>('external_signer_proposal_import', {
      proposalId,
      reviewedPsbt,
      signedPsbt
    });
  }
  discardExternalSignerSignature(proposalId: string, reviewedPsbt: string) {
    return command<MultisigProposal>('external_signer_proposal_discard_signature', {
      proposalId,
      reviewedPsbt
    });
  }
  signExternalWithHardware(proposalId: string, deviceId: string, reviewedPsbt: string) {
    return command<MultisigProposal>('hardware_sign_external', {
      proposalId,
      deviceId,
      reviewedPsbt
    });
  }
  async broadcastExternalSignerProposal(
    proposalId: string,
    reviewedPsbt: string,
    credential: string
  ) {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const result = await command<BroadcastResult>('external_signer_proposal_broadcast', {
      proposalId,
      reviewedPsbt,
      credential
    });
    result.snapshot = normalizeSnapshot(result.snapshot);
    this.#scheduleNotifications(false, walletId, generation);
    return result;
  }
  cancelExternalSignerProposal(proposalId: string) {
    return command<void>('external_signer_proposal_cancel', { proposalId });
  }
  verifyExternalAddress(deviceId: string, addressId: number) {
    return command<ReceiveAddress>('hardware_verify_external_address', {
      deviceId,
      addressId
    }).then(normalizeAddress);
  }
  async multisigSetupDraft() {
    const draft = await command<import('./contracts').MultisigSetupDraft | null>(
      'multisig_setup_draft'
    );
    return draft ? normalizeMultisigSetupDraft(draft) : null;
  }
  async saveMultisigSetupDraft(draft: import('./contracts').MultisigSetupDraft) {
    const savedDraft = await command<import('./contracts').MultisigSetupDraft>(
      'multisig_setup_draft_save',
      { draft: serializeMultisigSetupDraft(draft) }
    );
    return normalizeMultisigSetupDraft(savedDraft);
  }
  discardMultisigSetupDraft() {
    return command<void>('multisig_setup_draft_discard');
  }
  previewMultisig(policy: PolicyDraft) {
    return command<MultisigPreview>('multisig_preview', { policy });
  }
  analyzeRecoveryPolicy(template: RecoveryTemplate, cosigners: PolicyDraft['cosigners']) {
    return command<RecoveryPolicyAnalysis>('recovery_policy_analyze', { template, cosigners });
  }
  createMultisig(policy: PolicyDraft, credential: string, networkSetupSourceWalletId?: string) {
    this.#generation++;
    return command<MultisigCreation>('multisig_create', {
      policy,
      credential,
      networkSetupSourceWalletId
    });
  }
  createRecoveryMultisig(
    name: string,
    template: RecoveryTemplate,
    cosigners: PolicyDraft['cosigners'],
    credential: string,
    networkSetupSourceWalletId?: string
  ) {
    this.#generation++;
    return command<MultisigCreation>('multisig_recovery_create', {
      name,
      template,
      cosigners,
      credential,
      networkSetupSourceWalletId
    });
  }
  multisigWallet() {
    return command<MultisigWallet | null>('multisig_wallet');
  }
  renameMultisigSigner(signerId: string, label: string) {
    return command<MultisigWallet>('multisig_signer_rename', { signerId, label });
  }
  exportMultisig(credential: string) {
    return command<string>('multisig_export', { credential });
  }
  exportMultisigBsms(credential: string) {
    return command<string>('multisig_export_bsms', { credential });
  }
  savePublicBackup(suggestedFilename: string, content: string) {
    return command<SavedFileResult>('public_backup_save', { suggestedFilename, content });
  }
  preparePublicBackupPdf(suggestedFilename: string) {
    return command<PendingPdfExport>('public_backup_pdf_prepare', { suggestedFilename });
  }
  savePublicBackupPdf(saveToken: string, markup: string) {
    return command<SavedFileResult>('public_backup_pdf_save', {
      saveToken,
      markup
    });
  }
  inspectMultisigBsms(encodedBackup: string) {
    return command<RecoveryDrill>('multisig_bsms_inspect', { encodedBackup });
  }
  recoverMultisigBsms(name: string, encodedBackup: string, credential: string) {
    this.#generation++;
    return command<MultisigWallet>('multisig_recover_bsms', { name, encodedBackup, credential });
  }
  recoveryDrill(encodedBackup: string) {
    return command<RecoveryDrill>('multisig_recovery_drill', { encodedBackup });
  }
  multisigRecoveryDrillStatus() {
    return command<boolean>('multisig_recovery_drill_status');
  }
  recoverMultisig(encodedBackup: string, credential: string) {
    this.#generation++;
    return command<MultisigWallet>('multisig_recover', { encodedBackup, credential });
  }
  deleteMultisig(credential: string, confirmation: string) {
    this.#generation++;
    return command<void>('multisig_delete', { credential, confirmation });
  }
  async multisigSnapshot() {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const snapshot = normalizeSnapshot(await command<WalletSnapshot>('multisig_snapshot'));
    this.#scheduleNotifications(true, walletId, generation);
    return snapshot;
  }
  async syncMultisig(automatic = false) {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const snapshot = normalizeSnapshot(
      await command<WalletSnapshot>('multisig_sync', { automatic })
    );
    if (walletId && this.#isCurrent(walletId, generation)) {
      this.#scheduleNotifications(true, walletId, generation);
      this.#emit({ type: 'wallet_updated', walletId, walletKind: 'multisig', snapshot });
    }
    return snapshot;
  }
  createMultisigAddress(labels: string[]) {
    return command<ReceiveAddress>('multisig_address_create', { labels }).then(normalizeAddress);
  }
  claimObservedMultisigAddress(outpoint: string, label: string) {
    return command<ReceiveAddress>('multisig_address_claim_observed', { outpoint, label }).then(
      normalizeAddress
    );
  }
  discardMultisigAddress(id: number) {
    return command<void>('multisig_address_discard', { id });
  }
  verifyMultisigAddress(deviceId: string, addressId: number) {
    return command<ReceiveAddress>('hardware_verify_multisig_address', {
      deviceId,
      addressId
    }).then(normalizeAddress);
  }
  prepareMultisigPayment(
    recipient: string,
    labels: string[],
    amount: Sats,
    feeRate: FeeRate,
    coinSelection: CoinSelection = { mode: 'auto' }
  ) {
    return command<MultisigProposal>('multisig_tx_prepare', {
      recipient,
      labels,
      amount,
      feeRate: String(feeRate),
      coinSelection
    });
  }

  prepareMultisigPolicyRenewal(outpoint: string, labels: string[], feeRate: FeeRate) {
    return command<MultisigProposal>('multisig_policy_renewal_prepare', {
      outpoint,
      labels,
      feeRate: String(feeRate)
    });
  }
  prepareMultisigDelayedSpend(
    outpoint: string,
    recipient: string,
    labels: string[],
    feeRate: FeeRate
  ) {
    return command<MultisigProposal>('multisig_delayed_spend_prepare', {
      outpoint,
      recipient,
      labels,
      feeRate: String(feeRate)
    });
  }
  prepareMultisigAcceleration(
    txid: string,
    method: import('./contracts').AccelerationMethod,
    feeRate: FeeRate
  ) {
    return command<MultisigProposal>('multisig_acceleration_prepare', {
      txid,
      method,
      feeRate: String(feeRate)
    });
  }
  multisigProposals() {
    return command<MultisigProposal[]>('multisig_proposals');
  }
  importMultisigProposal(proposalId: string, reviewedPsbt: string, signedPsbt: string) {
    return command<MultisigProposal>('multisig_proposal_import', {
      proposalId,
      reviewedPsbt,
      signedPsbt
    });
  }
  discardMultisigSignature(proposalId: string, reviewedPsbt: string, signerFingerprint: string) {
    return command<MultisigProposal>('multisig_proposal_discard_signature', {
      proposalId,
      reviewedPsbt,
      signerFingerprint
    });
  }
  signMultisigWithHardware(proposalId: string, deviceId: string, reviewedPsbt: string) {
    return command<MultisigProposal>('hardware_sign_multisig', {
      proposalId,
      deviceId,
      reviewedPsbt
    });
  }
  async broadcastMultisigProposal(proposalId: string, reviewedPsbt: string, credential: string) {
    const generation = this.#generation;
    const walletId = this.#selectedWalletId;
    const result = await command<BroadcastResult>('multisig_proposal_broadcast', {
      proposalId,
      reviewedPsbt,
      credential
    });
    result.snapshot = normalizeSnapshot(result.snapshot);
    this.#scheduleNotifications(true, walletId, generation);
    return result;
  }
  cancelMultisigProposal(proposalId: string) {
    return command<void>('multisig_proposal_cancel', { proposalId });
  }
  savePsbt(suggestedFilename: string, psbt: string) {
    return command<SavedFileResult>('psbt_file_save', { suggestedFilename, psbt });
  }
  revealSavedFile(revealToken: string) {
    return command<void>('psbt_file_reveal', { revealToken });
  }
  encodePsbtUr(psbt: string, fragmentBytes = 180) {
    return command<string[]>('ur_encode_psbt', { psbt, fragmentBytes });
  }
  decodePsbtUr(frames: string[]) {
    return command<string>('ur_decode_psbt', { frames });
  }
  subscribe(listener: (event: WalletEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #isCurrent(walletId: string, generation: number) {
    return walletId === this.#selectedWalletId && generation === this.#generation;
  }
  #scheduleNotifications(multisig: boolean, walletId: string | null, generation: number) {
    if (!walletId || !this.#isCurrent(walletId, generation) || !this.#listeners.size) return;
    // Durable rows retry on the next read/sync. Delivery failure must never
    // turn a successful snapshot or broadcast into a false operation failure.
    void this.#drainNotifications(multisig, walletId, generation).catch(() => undefined);
  }
  async #drainNotifications(multisig: boolean, walletId: string, generation: number) {
    const key = `${walletId}:${multisig}:${generation}`;
    const pendingDrain = this.#notificationDrains.get(key);
    if (pendingDrain) return pendingDrain;
    const drain = (async () => {
      for (let batch = 0; batch < MAX_NOTIFICATION_BATCHES_PER_DRAIN; batch += 1) {
        if (!this.#isCurrent(walletId, generation) || !this.#listeners.size) return;
        const { sessionId, envelopes } = await command<{
          sessionId: string;
          envelopes: NotificationEnvelope[];
        }>('wallet_notifications', {
          multisig,
          walletId
        });
        for (const event of coalesceNotificationEvents(
          envelopes.map((envelope) => envelope.event)
        )) {
          if (!this.#isCurrent(walletId, generation) || !this.#listeners.size) return;
          this.#emit(event);
        }
        if (!this.#isCurrent(walletId, generation) || !this.#listeners.size) return;
        if (!envelopes.length) break;
        await command<void>('wallet_notifications_ack', {
          multisig,
          walletId,
          sessionId,
          ids: envelopes.map((envelope) => envelope.id)
        });
        if (envelopes.length < NOTIFICATION_BATCH_SIZE) break;
      }
    })();
    this.#notificationDrains.set(key, drain);
    try {
      await drain;
    } finally {
      this.#notificationDrains.delete(key);
    }
  }
  #emit(event: WalletEvent) {
    this.#listeners.forEach((listener) => listener(event));
  }
}
