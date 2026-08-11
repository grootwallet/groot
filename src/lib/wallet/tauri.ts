import { invoke } from '@tauri-apps/api/core';
import type { ReceiveAddress } from '$lib/types';
import {
  WalletError,
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
import type { MnemonicPresentation, SupplementalEntropyInput, WalletProfile, WalletRegistry } from './contracts';
import type { CosignerHealthCheck, HardwareDevice, MultisigPreview, MultisigProposal, MultisigWallet } from './contracts';
import type { RecoveryDrill, RecoveryPolicyAnalysis, RecoveryTemplate } from './contracts';
import type { ExternalSigner, ExternalSignerBackup, ExternalSignerSource, ExternalSignerWallet, SavedFileResult } from './contracts';
import type { CoreNodeConfig, NodeStatus } from './contracts';
import type { PolicyDraft } from '$lib/multisig/policy';

type BackendError = { code?: string; message?: string };
type NotificationEnvelope = { id: number; event: WalletEvent };

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args);
  } catch (error) {
    const backend = error as BackendError;
    throw new WalletError(
      (backend?.code ?? 'internal_error') as ConstructorParameters<typeof WalletError>[0],
      backend?.message ?? (typeof error === 'string' ? error : 'The wallet command failed.')
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
    created: normalizeTimestamp(address.created) ?? address.created,
    hardwareVerifiedAt: normalizeTimestamp(address.hardwareVerifiedAt ?? null)
  };
}

function normalizeSnapshot(snapshot: WalletSnapshot): WalletSnapshot {
  return {
    ...snapshot,
    syncedAt: normalizeTimestamp(snapshot.syncedAt),
    receiveAddresses: snapshot.receiveAddresses.map(normalizeAddress),
    transactions: snapshot.transactions.map((transaction) => ({
      ...transaction,
      date: normalizeTimestamp(transaction.date) ?? transaction.date
    }))
  };
}

export class TauriWalletAdapter implements WalletPort {
  #listeners = new Set<(event: WalletEvent) => void>();
  #last: WalletSnapshot | null = null;
  #notificationDrains = new Map<boolean, Promise<void>>();

  exists() { return command<boolean>('wallet_exists'); }
  profiles() { return command<WalletRegistry>('wallet_profiles'); }
  async renameWallet(name: string) {
    const profile = await command<WalletProfile>('wallet_rename', { name });
    this.#emit({ type: 'wallet_profile_updated', profile });
    return profile;
  }
  saveInactivityTimeout(minutes: number) { return command<WalletRegistry>('wallet_inactivity_timeout_save', { minutes }); }
  selectWallet(walletId: string) { return command<WalletProfile>('wallet_select', { walletId }); }
  async generateMnemonic(supplementalEntropy?: SupplementalEntropyInput): Promise<MnemonicPresentation> {
    const backupVerified = await command<boolean>('wallet_generate_mnemonic', { supplementalEntropy: supplementalEntropy ?? null });
    return { mode: 'native', backupVerified };
  }
  cancelOnboarding() { return command<void>('wallet_cancel_onboarding'); }
  createWallet(name: string, credential: string, _backupVerified: boolean) { return command<void>('wallet_create', { name, credential }); }
  verifyBackup(credential: string) { return command<boolean>('wallet_verify_backup', { credential }); }
  recoverWallet(name: string, mnemonic: string, credential: string) { return command<void>('wallet_recover', { name, mnemonic, credential }); }
  unlock(credential: string) { return command<void>('wallet_unlock', { credential }); }
  lock() { return command<void>('wallet_lock'); }
  deleteWallet(credential: string, confirmation: string) { return command<void>('wallet_delete', { credential, confirmation }); }
  resetRegtestWallet(confirmation: string) { return command<void>('wallet_reset_regtest', { confirmation }); }
  nodeConfig() { return command<CoreNodeConfig>('node_config'); }
  saveNodeConfig(config: CoreNodeConfig, password: string, credential: string) { return command<NodeStatus>('node_config_save', { config, password, credential }); }
  testNodeConnection() { return command<NodeStatus>('node_connection_test'); }
  recoveryScanSettings() { return command<import('./contracts').RecoveryScanSettings>('recovery_scan_settings'); }
  saveRecoveryScanSettings(birthdayHeight: number, gapLimit: number, credential: string) { return command<import('./contracts').RecoveryScanSettings>('recovery_scan_settings_save', { birthdayHeight, gapLimit, credential }); }
  async fullRescan(credential: string) { const snapshot = normalizeSnapshot(await command<WalletSnapshot>('wallet_full_rescan', { credential })); this.#last = snapshot; return snapshot; }
  async snapshot() {
    const snapshot = normalizeSnapshot(await command<WalletSnapshot>('wallet_snapshot'));
    this.#last = snapshot;
    await this.#drainNotifications(false);
    return snapshot;
  }
  async sync() {
    const snapshot = normalizeSnapshot(await command<WalletSnapshot>('wallet_sync'));
    this.#last = snapshot;
    await this.#drainNotifications(false);
    this.#emit({ type: 'wallet_updated', walletKind: 'single_key', snapshot });
    return snapshot;
  }
  createAddress(label: string) { return command<ReceiveAddress>('address_create', { label }).then(normalizeAddress); }
  discardAddress(id: number) { return command<void>('address_discard', { id }); }
  setCoinFrozen(outpoint: string, frozen: boolean) { return command<void>('coin_set_frozen', { outpoint, frozen }); }
  setMultisigCoinFrozen(outpoint: string, frozen: boolean) { return command<void>('multisig_coin_set_frozen', { outpoint, frozen }); }
  estimateFees() { return command<FeeEstimates>('fees_estimate'); }
  preparePayment(recipient: string, label: string, amount: Sats, feeRate: FeeRate, coinSelection: CoinSelection = { mode: 'auto' }) {
    return command<PaymentProposal>('tx_prepare', { recipient, label, amount, feeRate, coinSelection });
  }
  prepareAcceleration(txid: string, method: import('./contracts').AccelerationMethod, feeRate: FeeRate) { return command<PaymentProposal>('tx_acceleration_prepare', { txid, method, feeRate }); }
  async signAndBroadcast(proposalId: string, credential: string) {
    const result = await command<BroadcastResult>('tx_sign_and_broadcast', { proposalId, credential });
    result.snapshot = normalizeSnapshot(result.snapshot);
    this.#last = result.snapshot;
    await this.#drainNotifications(false);
    return result;
  }
  listHardwareDevices() { return command<HardwareDevice[]>('hardware_list'); }
  promptHardwarePin(deviceId: string) { return command<string>('hardware_prompt_pin', { deviceId }); }
  sendHardwarePin(challengeId: string, pinPositions: string) { return command<void>('hardware_send_pin', { challengeId, pinPositions }); }
  async checkHardwareCosigner(cosigner: PolicyDraft['cosigners'][number]) {
    const result = await command<CosignerHealthCheck>('hardware_check_cosigner', { cosigner });
    return { ...result, checkedAt: normalizeTimestamp(result.checkedAt) ?? result.checkedAt };
  }
  importHardwareCosigner(deviceId: string, label: string, allowEmptyPassphrase = false) { return command<import('$lib/multisig/policy').CosignerDraft>('hardware_import_cosigner', { deviceId, label, allowEmptyPassphrase }); }
  parseExternalSignerImport(encoded: string, label: string, source: ExternalSignerSource) { return command<ExternalSigner>('external_signer_parse_import', { encoded, label, source }); }
  importHardwareExternalSigner(deviceId: string, label: string, allowEmptyPassphrase = false) { return command<ExternalSigner>('hardware_import_external_signer', { deviceId, label, allowEmptyPassphrase }); }
  createExternalSignerWallet(name: string, signer: ExternalSigner, credential: string) { return command<ExternalSignerWallet>('external_signer_create', { name, signer, credential }); }
  externalSignerWallet() { return command<ExternalSignerWallet>('external_signer_wallet'); }
  renameExternalSigner(label: string) { return command<ExternalSignerWallet>('external_signer_rename', { label }); }
  exportExternalSignerDescriptor(credential: string) { return command<ExternalSignerBackup>('external_signer_export_descriptor', { credential }); }
  externalSignerProposals() { return command<MultisigProposal[]>('external_signer_proposals'); }
  importExternalSignerProposal(proposalId: string, reviewedPsbt: string, signedPsbt: string) { return command<MultisigProposal>('external_signer_proposal_import', { proposalId, reviewedPsbt, signedPsbt }); }
  signExternalWithHardware(proposalId: string, deviceId: string, reviewedPsbt: string) { return command<MultisigProposal>('hardware_sign_external', { proposalId, deviceId, reviewedPsbt }); }
  async broadcastExternalSignerProposal(proposalId: string, reviewedPsbt: string, credential: string) {
    const result = await command<BroadcastResult>('external_signer_proposal_broadcast', { proposalId, reviewedPsbt, credential });
    result.snapshot = normalizeSnapshot(result.snapshot);
    this.#last = result.snapshot;
    await this.#drainNotifications(false);
    return result;
  }
  cancelExternalSignerProposal(proposalId: string) { return command<void>('external_signer_proposal_cancel', { proposalId }); }
  verifyExternalAddress(deviceId: string, addressId: number) { return command<ReceiveAddress>('hardware_verify_external_address', { deviceId, addressId }).then(normalizeAddress); }
  previewMultisig(policy: PolicyDraft) { return command<MultisigPreview>('multisig_preview', { policy }); }
  analyzeRecoveryPolicy(template: RecoveryTemplate, cosigners: PolicyDraft['cosigners']) { return command<RecoveryPolicyAnalysis>('recovery_policy_analyze', { template, cosigners }); }
  createMultisig(policy: PolicyDraft, credential: string) { return command<MultisigWallet>('multisig_create', { policy, credential }); }
  createRecoveryMultisig(name: string, template: RecoveryTemplate, cosigners: PolicyDraft['cosigners'], credential: string) { return command<MultisigWallet>('multisig_recovery_create', { name, template, cosigners, credential }); }
  multisigWallet() { return command<MultisigWallet | null>('multisig_wallet'); }
  exportMultisig(credential: string) { return command<string>('multisig_export', { credential }); }
  exportMultisigBsms(credential: string) { return command<string>('multisig_export_bsms', { credential }); }
  savePublicBackup(suggestedFilename: string, content: string) { return command<boolean>('public_backup_save', { suggestedFilename, content }); }
  printPublicBackup() { return command<void>('public_backup_print'); }
  inspectMultisigBsms(encodedBackup: string) { return command<RecoveryDrill>('multisig_bsms_inspect', { encodedBackup }); }
  recoverMultisigBsms(name: string, encodedBackup: string, credential: string) { return command<MultisigWallet>('multisig_recover_bsms', { name, encodedBackup, credential }); }
  recoveryDrill(encodedBackup: string) { return command<RecoveryDrill>('multisig_recovery_drill', { encodedBackup }); }
  recoverMultisig(encodedBackup: string, credential: string) { return command<MultisigWallet>('multisig_recover', { encodedBackup, credential }); }
  deleteMultisig(credential: string, confirmation: string) { return command<void>('multisig_delete', { credential, confirmation }); }
  async multisigSnapshot() { const snapshot = normalizeSnapshot(await command<WalletSnapshot>('multisig_snapshot')); await this.#drainNotifications(true); return snapshot; }
  async syncMultisig() { const snapshot = normalizeSnapshot(await command<WalletSnapshot>('multisig_sync')); this.#last = snapshot; await this.#drainNotifications(true); this.#emit({ type: 'wallet_updated', walletKind: 'multisig', snapshot }); return snapshot; }
  createMultisigAddress(label: string) { return command<ReceiveAddress>('multisig_address_create', { label }).then(normalizeAddress); }
  discardMultisigAddress(id: number) { return command<void>('multisig_address_discard', { id }); }
  verifyMultisigAddress(deviceId: string, addressId: number) { return command<ReceiveAddress>('hardware_verify_multisig_address', { deviceId, addressId }).then(normalizeAddress); }
  prepareMultisigPayment(recipient: string, label: string, amount: Sats, feeRate: FeeRate, coinSelection: CoinSelection = { mode: 'auto' }) { return command<MultisigProposal>('multisig_tx_prepare', { recipient, label, amount, feeRate, coinSelection }); }
  prepareMultisigAcceleration(txid: string, method: import('./contracts').AccelerationMethod, feeRate: FeeRate) { return command<MultisigProposal>('multisig_acceleration_prepare', { txid, method, feeRate }); }
  multisigProposals() { return command<MultisigProposal[]>('multisig_proposals'); }
  importMultisigProposal(proposalId: string, reviewedPsbt: string, signedPsbt: string) { return command<MultisigProposal>('multisig_proposal_import', { proposalId, reviewedPsbt, signedPsbt }); }
  signMultisigWithHardware(proposalId: string, deviceId: string, reviewedPsbt: string) { return command<MultisigProposal>('hardware_sign_multisig', { proposalId, deviceId, reviewedPsbt }); }
  async broadcastMultisigProposal(proposalId: string, reviewedPsbt: string, credential: string) {
    const result = await command<BroadcastResult>('multisig_proposal_broadcast', { proposalId, reviewedPsbt, credential });
    result.snapshot = normalizeSnapshot(result.snapshot);
    await this.#drainNotifications(true);
    return result;
  }
  cancelMultisigProposal(proposalId: string) { return command<void>('multisig_proposal_cancel', { proposalId }); }
  savePsbt(suggestedFilename: string, psbt: string) { return command<SavedFileResult>('psbt_file_save', { suggestedFilename, psbt }); }
  revealSavedFile(revealToken: string) { return command<void>('psbt_file_reveal', { revealToken }); }
  encodePsbtUr(psbt: string, fragmentBytes = 180) { return command<string[]>('ur_encode_psbt', { psbt, fragmentBytes }); }
  decodePsbtUr(frames: string[]) { return command<string>('ur_decode_psbt', { frames }); }
  subscribe(listener: (event: WalletEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async #drainNotifications(multisig: boolean) {
    const pendingDrain = this.#notificationDrains.get(multisig);
    if (pendingDrain) return pendingDrain;
    const drain = (async () => {
      const envelopes = await command<NotificationEnvelope[]>('wallet_notifications', { multisig });
      for (const envelope of envelopes) this.#emit(envelope.event);
      if (envelopes.length) {
        await command<void>('wallet_notifications_ack', { multisig, ids: envelopes.map((envelope) => envelope.id) });
      }
    })();
    this.#notificationDrains.set(multisig, drain);
    try { await drain; }
    finally { this.#notificationDrains.delete(multisig); }
  }
  #emit(event: WalletEvent) { this.#listeners.forEach((listener) => listener(event)); }
}
