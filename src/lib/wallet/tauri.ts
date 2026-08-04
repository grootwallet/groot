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
import type { MnemonicPresentation, WalletProfile, WalletRegistry } from './contracts';
import type { CosignerHealthCheck, HardwareDevice, MultisigPreview, MultisigProposal, MultisigWallet } from './contracts';
import type { RecoveryDrill, RecoveryPolicyAnalysis, RecoveryTemplate } from './contracts';
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

function formatTime(value: string | null): string | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toLocaleString() : value;
}

function normalizeAddress(address: ReceiveAddress): ReceiveAddress {
  return { ...address, created: formatTime(address.created) ?? address.created };
}

function normalizeSnapshot(snapshot: WalletSnapshot): WalletSnapshot {
  return {
    ...snapshot,
    syncedAt: formatTime(snapshot.syncedAt),
    receiveAddresses: snapshot.receiveAddresses.map(normalizeAddress),
    transactions: snapshot.transactions.map((transaction) => ({
      ...transaction,
      date: formatTime(transaction.date) ?? transaction.date
    }))
  };
}

export class TauriWalletAdapter implements WalletPort {
  #listeners = new Set<(event: WalletEvent) => void>();
  #last: WalletSnapshot | null = null;

  exists() { return command<boolean>('wallet_exists'); }
  profiles() { return command<WalletRegistry>('wallet_profiles'); }
  selectWallet(walletId: string) { return command<WalletProfile>('wallet_select', { walletId }); }
  async generateMnemonic(): Promise<MnemonicPresentation> {
    await command<void>('wallet_generate_mnemonic');
    return { mode: 'native' };
  }
  cancelOnboarding() { return command<void>('wallet_cancel_onboarding'); }
  createWallet(name: string, credential: string) { return command<void>('wallet_create', { name, credential }); }
  recoverWallet(name: string, mnemonic: string, credential: string) { return command<void>('wallet_recover', { name, mnemonic, credential }); }
  unlock(credential: string) { return command<void>('wallet_unlock', { credential }); }
  lock() { return command<void>('wallet_lock'); }
  deleteWallet(credential: string, confirmation: string) { return command<void>('wallet_delete', { credential, confirmation }); }
  resetRegtestWallet(confirmation: string) { return command<void>('wallet_reset_regtest', { confirmation }); }
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
    return snapshot;
  }
  createAddress(label: string) { return command<ReceiveAddress>('address_create', { label }).then(normalizeAddress); }
  discardAddress(id: number) { return command<void>('address_discard', { id }); }
  setCoinFrozen(outpoint: string, frozen: boolean) { return command<void>('coin_set_frozen', { outpoint, frozen }); }
  estimateFees() { return command<FeeEstimates>('fees_estimate'); }
  preparePayment(recipient: string, amount: Sats, feeRate: FeeRate, coinSelection: CoinSelection = { mode: 'auto' }) {
    return command<PaymentProposal>('tx_prepare', { recipient, amount, feeRate, coinSelection });
  }
  async signAndBroadcast(proposalId: string, credential: string) {
    const result = await command<BroadcastResult>('tx_sign_and_broadcast', { proposalId, credential });
    result.snapshot = normalizeSnapshot(result.snapshot);
    this.#last = result.snapshot;
    await this.#drainNotifications(false);
    return result;
  }
  listHardwareDevices() { return command<HardwareDevice[]>('hardware_list'); }
  async checkHardwareCosigner(cosigner: PolicyDraft['cosigners'][number]) {
    const result = await command<CosignerHealthCheck>('hardware_check_cosigner', { cosigner });
    return { ...result, checkedAt: formatTime(result.checkedAt) ?? result.checkedAt };
  }
  importHardwareCosigner(deviceId: string, label: string) { return command<import('$lib/multisig/policy').CosignerDraft>('hardware_import_cosigner', { deviceId, label }); }
  previewMultisig(policy: PolicyDraft) { return command<MultisigPreview>('multisig_preview', { policy }); }
  analyzeRecoveryPolicy(template: RecoveryTemplate, cosigners: PolicyDraft['cosigners']) { return command<RecoveryPolicyAnalysis>('recovery_policy_analyze', { template, cosigners }); }
  createMultisig(policy: PolicyDraft, credential: string) { return command<MultisigWallet>('multisig_create', { policy, credential }); }
  createRecoveryMultisig(name: string, template: RecoveryTemplate, cosigners: PolicyDraft['cosigners'], credential: string) { return command<MultisigWallet>('multisig_recovery_create', { name, template, cosigners, credential }); }
  multisigWallet() { return command<MultisigWallet | null>('multisig_wallet'); }
  exportMultisig(credential: string) { return command<string>('multisig_export', { credential }); }
  recoveryDrill(encodedBackup: string) { return command<RecoveryDrill>('multisig_recovery_drill', { encodedBackup }); }
  recoverMultisig(encodedBackup: string, credential: string) { return command<MultisigWallet>('multisig_recover', { encodedBackup, credential }); }
  deleteMultisig(credential: string, confirmation: string) { return command<void>('multisig_delete', { credential, confirmation }); }
  async multisigSnapshot() { const snapshot = normalizeSnapshot(await command<WalletSnapshot>('multisig_snapshot')); await this.#drainNotifications(true); return snapshot; }
  async syncMultisig() { const snapshot = normalizeSnapshot(await command<WalletSnapshot>('multisig_sync')); await this.#drainNotifications(true); return snapshot; }
  createMultisigAddress(label: string) { return command<ReceiveAddress>('multisig_address_create', { label }).then(normalizeAddress); }
  discardMultisigAddress(id: number) { return command<void>('multisig_address_discard', { id }); }
  prepareMultisigPayment(recipient: string, amount: Sats, feeRate: FeeRate) { return command<MultisigProposal>('multisig_tx_prepare', { recipient, amount, feeRate }); }
  multisigProposals() { return command<MultisigProposal[]>('multisig_proposals'); }
  importMultisigProposal(proposalId: string, signedPsbt: string) { return command<MultisigProposal>('multisig_proposal_import', { proposalId, signedPsbt }); }
  signMultisigWithHardware(proposalId: string, deviceId: string) { return command<MultisigProposal>('hardware_sign_multisig', { proposalId, deviceId }); }
  async broadcastMultisigProposal(proposalId: string, credential: string) {
    const result = await command<BroadcastResult>('multisig_proposal_broadcast', { proposalId, credential });
    result.snapshot = normalizeSnapshot(result.snapshot);
    await this.#drainNotifications(true);
    return result;
  }
  cancelMultisigProposal(proposalId: string) { return command<void>('multisig_proposal_cancel', { proposalId }); }
  subscribe(listener: (event: WalletEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async #drainNotifications(multisig: boolean) {
    const envelopes = await command<NotificationEnvelope[]>('wallet_notifications', { multisig });
    for (const envelope of envelopes) this.#emit(envelope.event);
    if (envelopes.length) {
      await command<void>('wallet_notifications_ack', { multisig, ids: envelopes.map((envelope) => envelope.id) });
    }
  }
  #emit(event: WalletEvent) { this.#listeners.forEach((listener) => listener(event)); }
}
