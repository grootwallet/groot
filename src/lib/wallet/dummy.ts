import { defaultConfig } from '$lib/config';
import { receiveAddresses, transactions, utxos, wallet } from '$lib/data';
import type { ReceiveAddress } from '$lib/types';
import { addressPrefixForNetwork, canDiscardAddress, hasAddressPrefixForNetwork, normalizePermanentLabel } from './policy';
import { feeRate, sats, WalletError, type CoinSelection, type FeeEstimates, type PaymentProposal, type WalletEvent, type WalletPort, type WalletSnapshot } from './contracts';
import type { CoreNodeConfig, ExternalSigner, ExternalSignerSource, ExternalSignerWallet, MultisigPreview, MultisigProposal, MultisigWallet, RecoveryPolicyAnalysis, RecoveryTemplate, WalletProfile } from './contracts';
import type { PolicyDraft } from '$lib/multisig/policy';
import { descriptorPreview, MULTISIG_ACCOUNT_PATH, normalizeCosigner, validatePolicyDraft } from '$lib/multisig/policy';

const prototypeCredential = 'prototype-passphrase';
const fixtureCosigners: PolicyDraft['cosigners'] = [
  { id: 'fixture-coldcard', label: 'Coldcard', fingerprint: 'f00dbabe', xpub: 'tpubD6NzVbkrYhZ4Y-fixture-coldcard-public-key', derivationPath: MULTISIG_ACCOUNT_PATH, source: 'virtual' },
  { id: 'fixture-trezor', label: 'Trezor', fingerprint: 'c0ffee01', xpub: 'tpubD6NzVbkrYhZ4Y-fixture-trezor-public-key', derivationPath: MULTISIG_ACCOUNT_PATH, source: 'virtual' },
  { id: 'fixture-backup', label: 'Offline backup', fingerprint: 'deadbeef', xpub: 'tpubD6NzVbkrYhZ4Y-fixture-backup-public-key', derivationPath: MULTISIG_ACCOUNT_PATH, source: 'manual' }
];

function fixtureAddressForNetwork(address: string): string {
  return address.replace(/^(tb1|bcrt1)/, addressPrefixForNetwork(defaultConfig.network));
}

function fixtureMultisigWallet(): MultisigWallet {
  return {
    kind: 'multisig',
    name: 'Family vault',
    threshold: 2,
    cosigners: structuredClone(fixtureCosigners),
    externalDescriptor: descriptorPreview(2, fixtureCosigners, 0),
    internalDescriptor: descriptorPreview(2, fixtureCosigners, 1),
    createdAt: '2026-07-17T10:00:00.000Z',
    policyType: 'standard'
  };
}

export class DummyWalletAdapter implements WalletPort {
  #exists = typeof location === 'undefined' || !new URLSearchParams(location.search).has('fixture-empty');
  #listeners = new Set<(event: WalletEvent) => void>();
  #proposals = new Map<string, PaymentProposal>();
  #multisig: MultisigWallet | null = this.#exists ? fixtureMultisigWallet() : null;
  #multisigCredential = this.#exists ? prototypeCredential : '';
  #multisigProfileId: string | null = this.#exists ? 'fixture-multisig' : null;
  #multisigProposals = new Map<string, MultisigProposal>();
  #recoveryVerified = false;
  #externalWallet: ExternalSignerWallet | null = null;
  #externalProposals = new Map<string, MultisigProposal>();
  #profiles: WalletProfile[] = this.#exists ? [
    { id: 'fixture-single', name: 'Everyday wallet', network: defaultConfig.network, kind: 'single_key', descriptorChecksum: 'fixture01', createdAt: 1 },
    { id: 'fixture-multisig', name: 'Family vault', network: defaultConfig.network, kind: 'multisig', descriptorChecksum: 'demo2of3', createdAt: 2 }
  ] : [];
  #selectedWalletId: string | null = this.#profiles[0]?.id ?? null;
  #inactivityTimeoutMinutes = 5;
  #credentials = new Map<string, string>(this.#profiles.map((profile) => [profile.id, prototypeCredential]));
  #unlockedWalletIds = new Set<string>(this.#profiles[0] ? [this.#profiles[0].id] : []);
  #coins = structuredClone(utxos).map((coin) => ({ ...coin, address: fixtureAddressForNetwork(coin.address) }));
  #addresses = structuredClone(receiveAddresses).map((address) => ({ ...address, address: fixtureAddressForNetwork(address.address) }));
  #balance = wallet.balance;
  #nodeConfig: CoreNodeConfig = { backend: { type: 'local_core', url: 'http://127.0.0.1:18443' }, auth: 'cookie', username: null };
  #scanSettings = { birthdayHeight: 0, gapLimit: 20 };
  #trezorPinUnlocked = false;
  #secureStorageRetryPending = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('fixture-secure-storage-retry');

  async exists() { return this.#exists; }
  async profiles() { return { version: 1, selectedWalletId: this.#selectedWalletId, wallets: structuredClone(this.#profiles), inactivityTimeoutMinutes: this.#inactivityTimeoutMinutes }; }
  async saveInactivityTimeout(minutes: number) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      throw new WalletError('invalid_inactivity_timeout', 'Automatic lock must be between 1 and 60 minutes.');
    }
    this.#inactivityTimeoutMinutes = minutes;
    return this.profiles();
  }
  async selectWallet(walletId: string) {
    const profile = this.#profiles.find((wallet) => wallet.id === walletId);
    if (!profile) throw new WalletError('wallet_not_found', 'The selected wallet does not exist.');
    this.#selectedWalletId = walletId;
    return structuredClone(profile);
  }
  async generateMnemonic() { return { mode: 'fixture' as const, words: 'adapt cactus lesson motor acoustic globe ribbon pluck vessel deputy crisp fossil harbor pencil drift copper museum twelve gentle oak fabric north silent width'.split(' ') }; }
  async cancelOnboarding() {}
  async createWallet(name: string, credential: string) {
    if (!name.trim()) throw new WalletError('invalid_wallet_name', 'A wallet name is required.');
    if (!credential) throw new WalletError('invalid_credential', 'A passphrase / PIN is required.');
    const profile = { id: crypto.randomUUID(), name: name.trim(), network: defaultConfig.network, kind: 'single_key' as const, descriptorChecksum: crypto.randomUUID().replaceAll('-', '').slice(0, 8), createdAt: Date.now() };
    this.#profiles.push(profile); this.#selectedWalletId = profile.id; this.#credentials.set(profile.id, credential); this.#unlockedWalletIds.add(profile.id);
    this.#exists = true;
  }
  async recoverWallet(name: string, mnemonic: string, credential: string) {
    if (mnemonic.trim().split(/\s+/).length !== 24) throw new WalletError('invalid_mnemonic', 'Satchel requires exactly 24 recovery words.');
    return this.createWallet(name, credential);
  }
  async unlock(credential: string) {
    if (this.#secureStorageRetryPending) {
      this.#secureStorageRetryPending = false;
      throw new WalletError(
        'secure_storage_unavailable',
        'macOS Keychain access is unavailable. Enter your PIN again and approve the Satchel system prompt. The wallet stayed locked.'
      );
    }
    const expected = this.#selectedWalletId ? this.#credentials.get(this.#selectedWalletId) : undefined;
    if (credential !== expected) throw new WalletError('invalid_credential', 'Incorrect passphrase / PIN.');
    if (this.#selectedWalletId) this.#unlockedWalletIds.add(this.#selectedWalletId);
  }
  async lock() { if (this.#selectedWalletId) this.#unlockedWalletIds.delete(this.#selectedWalletId); }
  async deleteWallet(credential: string, confirmation: string) {
    if (confirmation !== 'DELETE') throw new WalletError('confirmation_mismatch', 'Type DELETE exactly.');
    const expected = this.#selectedWalletId ? this.#credentials.get(this.#selectedWalletId) : undefined;
    if (credential !== expected) throw new WalletError('invalid_credential', 'Incorrect passphrase / PIN.');
    if (this.#selectedWalletId) {
      this.#profiles = this.#profiles.filter((wallet) => wallet.id !== this.#selectedWalletId);
      this.#credentials.delete(this.#selectedWalletId);
      this.#unlockedWalletIds.delete(this.#selectedWalletId);
      if (this.#selectedWalletId === this.#multisigProfileId) {
        this.#multisig = null; this.#multisigCredential = ''; this.#multisigProfileId = null; this.#multisigProposals.clear();
      }
    }
    this.#selectedWalletId = this.#profiles[0]?.id ?? null; this.#exists = this.#profiles.length > 0; this.#proposals.clear();
  }
  async resetRegtestWallet(confirmation: string) {
    if (confirmation !== 'RESET REGTEST') throw new WalletError('confirmation_mismatch', 'Type RESET REGTEST exactly.');
    if (this.#selectedWalletId) {
      this.#profiles = this.#profiles.filter((wallet) => wallet.id !== this.#selectedWalletId);
      this.#credentials.delete(this.#selectedWalletId);
      this.#unlockedWalletIds.delete(this.#selectedWalletId);
    }
    this.#selectedWalletId = this.#profiles[0]?.id ?? null; this.#exists = this.#profiles.length > 0; this.#proposals.clear();
  }
  async nodeConfig() { return structuredClone(this.#nodeConfig); }
  async saveNodeConfig(config: CoreNodeConfig, password: string, credential: string) {
    if (!this.#selectedWalletId || credential !== this.#credentials.get(this.#selectedWalletId)) throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (config.auth === 'user_pass' && !password) throw new WalletError('internal_error', 'RPC password is required.');
    this.#nodeConfig = { ...config, backend: { ...config.backend } }; return { connected: true, blocks: 301, backend: { ...config, backend: { ...config.backend } } };
  }
  async testNodeConnection() { return { connected: true, blocks: 301, backend: structuredClone(this.#nodeConfig) }; }
  async recoveryScanSettings() { return { ...this.#scanSettings }; }
  async saveRecoveryScanSettings(birthdayHeight: number, gapLimit: number, credential: string) { if (!this.#selectedWalletId || credential !== this.#credentials.get(this.#selectedWalletId)) throw new WalletError('invalid_credential', 'Incorrect app PIN.'); if (!Number.isInteger(birthdayHeight)||birthdayHeight<0||!Number.isInteger(gapLimit)||gapLimit<20||gapLimit>1000) throw new WalletError('internal_error','Invalid recovery scan settings.'); this.#scanSettings={birthdayHeight,gapLimit}; return {...this.#scanSettings}; }
  async fullRescan(credential: string) { if (!this.#selectedWalletId || credential !== this.#credentials.get(this.#selectedWalletId)) throw new WalletError('invalid_credential', 'Incorrect app PIN.'); return this.snapshot(); }

  async snapshot(): Promise<WalletSnapshot> {
    if (!this.#selectedWalletId || !this.#unlockedWalletIds.has(this.#selectedWalletId)) {
      throw new WalletError('wallet_locked', 'This wallet is locked.');
    }
    const emptyActivity = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fixture-empty-activity');
    return {
      network: defaultConfig.network,
      balance: { confirmed: sats(Math.max(0, this.#balance - wallet.pending)), pending: sats(Math.min(wallet.pending, this.#balance)), trustedPending: sats(Math.min(wallet.pending, this.#balance)), total: sats(this.#balance) },
      transactions: emptyActivity ? [] : structuredClone(transactions),
      utxos: structuredClone(this.#coins),
      receiveAddresses: structuredClone(this.#addresses),
      syncedAt: new Date().toISOString()
    };
  }

  async sync(): Promise<WalletSnapshot> { return this.snapshot(); }

  async createAddress(rawLabel: string): Promise<ReceiveAddress> {
    const label = normalizePermanentLabel(rawLabel);
    const id = Math.max(8, ...this.#addresses.map((address) => address.id)) + 1;
    const address: ReceiveAddress = { id, address: `${addressPrefixForNetwork(defaultConfig.network)}qdummy${id.toString().padStart(4, '0')}5n8k2r7v4cx9s6jlawephgzuqf5t8ul`, label, created: 'Just now', status: 'awaiting', derivationPath: `m/84'/1'/0'/0/${id}` };
    this.#addresses = [address, ...this.#addresses];
    return structuredClone(address);
  }

  async discardAddress(id: number): Promise<void> {
    const address = this.#addresses.find((item) => item.id === id);
    if (!address || !canDiscardAddress(address, false)) {
      throw new WalletError('address_not_discardable', 'Only an unused address awaiting payment can be discarded.');
    }
    this.#addresses = this.#addresses.map((address) => address.id === id ? { ...address, status: 'discarded' } : address);
  }

  async setCoinFrozen(outpoint: string, frozen: boolean) {
    const coin = this.#coins.find((item) => item.outpoint === outpoint);
    if (!coin) throw new WalletError('internal_error', 'The selected coin is no longer available.');
    coin.frozen = frozen;
  }

  async setMultisigCoinFrozen(outpoint: string, frozen: boolean) {
    return this.setCoinFrozen(outpoint, frozen);
  }

  async estimateFees(): Promise<FeeEstimates> {
    return { economy: feeRate(3), standard: feeRate(7), priority: feeRate(12), source: 'mempool.space' };
  }

  async preparePayment(recipient: string, rawLabel: string, amount: ReturnType<typeof sats>, selectedRate: ReturnType<typeof feeRate>, coinSelection: CoinSelection = { mode: 'auto' }): Promise<PaymentProposal> {
    if (!hasAddressPrefixForNetwork(recipient, defaultConfig.network)) throw new WalletError('invalid_address', 'Recipient must match the active Bitcoin network.');
    const label = normalizePermanentLabel(rawLabel);
    const fee = sats(Math.ceil(Number(selectedRate) * 141));
    const spendable = this.#coins.filter((coin) => !coin.frozen && (coinSelection.mode === 'auto' || coinSelection.outpoints.includes(coin.outpoint)));
    const available = spendable.reduce((total, coin) => total + coin.amount, 0);
    if (Number(amount) + Number(fee) > available) throw new WalletError('insufficient_funds', 'Amount and fee exceed the selected, unfrozen balance.');
    const selectedOutpoints = coinSelection.mode === 'manual' ? spendable.map((coin) => coin.outpoint) : [];
    const proposal: PaymentProposal = { proposalId: crypto.randomUUID(), recipient, label, amount, fee, feeRate: selectedRate, total: sats(Number(amount) + Number(fee)), selectedOutpoints };
    this.#proposals.set(proposal.proposalId, proposal);
    if (this.#profiles.find((profile) => profile.id === this.#selectedWalletId)?.kind === 'watch_only') {
      this.#externalProposals.set(proposal.proposalId, { ...proposal, psbt: 'cHNidP8BAFICAAAA', signed: 0, required: 1, canFinalize: false, signedFingerprints: [], status: 'collecting', createdAt: new Date().toISOString() });
    }
    return proposal;
  }
  async prepareAcceleration(txid: string, method: import('./contracts').AccelerationMethod, selectedRate: ReturnType<typeof feeRate>) { const tx=transactions.find((item)=>item.id===txid); if(!tx||tx.status!=='pending') throw new WalletError('internal_error','Only pending wallet transactions can be accelerated.'); return this.preparePayment(fixtureAddressForNetwork(tx.address),tx.label,sats(Math.max(1,tx.amount)),selectedRate); }

  async signAndBroadcast(proposalId: string, credential: string) {
    const proposal = this.#proposals.get(proposalId);
    if (!proposal) throw new WalletError('wallet_not_found', 'Payment proposal was not found or expired.');
    if (!this.#selectedWalletId || credential !== this.#credentials.get(this.#selectedWalletId)) throw new WalletError('invalid_credential', 'Incorrect passphrase / PIN.');
    const txid = '0a7bf3d7a98d8bc981975320eba8e9b8ac1aa92145dcf018e48c3c2f8c19e2aa';
    this.#balance = Math.max(0, this.#balance - Number(proposal.total));
    this.#emit({ type: 'transaction_broadcast', txid, balance: sats(this.#balance) });
    this.#proposals.delete(proposalId);
    return { txid, snapshot: await this.snapshot(), syncPending: false };
  }

  async listHardwareDevices() {
    return [
      { id: 'virtual-coldcard', label: 'Virtual Coldcard', model: 'Coldcard simulator', fingerprint: 'f00dbabe', connected: true, status: 'ready' as const, message: 'Ready to import the public account key.', action: 'import' as const },
      { id: 'virtual-ledger-outsider', label: 'Virtual Ledger outsider', model: 'Ledger simulator', fingerprint: '1ed9e001', connected: true, status: 'ready' as const, message: 'Connected, but not part of the demo wallet.', action: 'import' as const },
      this.#trezorPinUnlocked
        ? { id: 'virtual-trezor', label: 'Virtual Trezor One', model: 'Trezor simulator', fingerprint: 'c0ffee03', connected: true, status: 'needs_passphrase' as const, message: 'Unlocked. Choose the standard wallet with no passphrase, or select a hidden wallet on-device when supported.', action: 'confirm_empty_passphrase' as const }
        : { id: 'virtual-trezor', label: 'Virtual Trezor One', model: 'Trezor simulator', fingerprint: null, connected: true, status: 'needs_pin' as const, message: 'Locked. Start the PIN matrix, then tap the blank cells matching the locations shown on the device.', action: 'prompt_pin' as const },
      { id: 'virtual-trezor-standard', label: 'Virtual Trezor Standard', model: 'Trezor simulator', fingerprint: 'c0ffee02', connected: true, status: 'needs_passphrase' as const, message: 'Passphrase protection is enabled. Choose the standard wallet with no passphrase, or select a hidden wallet on-device when supported.', action: 'confirm_empty_passphrase' as const }
    ];
  }
  async promptHardwarePin(deviceId: string) {
    if (deviceId !== 'virtual-trezor' || this.#trezorPinUnlocked) throw new WalletError('invalid_hardware_request', 'This device does not need the PIN-matrix flow.');
    return 'fixture-pin-challenge';
  }
  async sendHardwarePin(challengeId: string, pinPositions: string) {
    if (challengeId !== 'fixture-pin-challenge') throw new WalletError('hardware_challenge_expired', 'The PIN request expired.');
    if (!/^[1-9]{1,50}$/.test(pinPositions)) throw new WalletError('invalid_hardware_request', 'Enter only PIN-matrix positions 1 through 9.');
    this.#trezorPinUnlocked = true;
  }
  async checkHardwareCosigner(cosigner: PolicyDraft['cosigners'][number]) {
    const checkedAt = new Date().toISOString();
    if (cosigner.source === 'usb' || cosigner.source === 'virtual') {
      const devices = await this.listHardwareDevices();
      const connected = devices.find((device) => device.connected && device.fingerprint?.toLowerCase() === cosigner.fingerprint.toLowerCase());
      if (!connected) throw new WalletError('hardware_unavailable', 'Connect and unlock this device, then keep it ready over USB.');
      return { status: 'healthy' as const, checkedAt, summary: `Connected identity matches ${cosigner.fingerprint}.` };
    }
    return { status: 'record_valid' as const, checkedAt, summary: 'Public key, fingerprint, and derivation path are complete. Physical presence cannot be checked for an offline key.' };
  }
  async importHardwareCosigner(deviceId: string, label: string, allowEmptyPassphrase = false) {
    const trezor = deviceId === 'virtual-trezor-standard' || deviceId === 'virtual-trezor';
    if (trezor && !allowEmptyPassphrase) throw new WalletError('hardware_wallet_selection_required', 'Choose whether this cosigner uses the standard wallet with no passphrase.');
    if (deviceId === 'virtual-trezor' && !this.#trezorPinUnlocked) throw new WalletError('hardware_unavailable', 'Unlock this Trezor before selecting its wallet.');
    if (!['virtual-coldcard', 'virtual-trezor-standard', 'virtual-trezor'].includes(deviceId)) throw new WalletError('hardware_unavailable', 'The selected device is no longer connected.');
    const trezorFingerprint = deviceId === 'virtual-trezor' ? 'c0ffee03' : 'c0ffee02';
    return { id: deviceId, label, fingerprint: trezor ? trezorFingerprint : 'f00dbabe', xpub: trezor ? 'tpubD6NzVbkrYhZ4Y-virtual-trezor-standard-public-key' : 'tpubD6NzVbkrYhZ4Y-virtual-hardware-public-key', derivationPath: MULTISIG_ACCOUNT_PATH, source: 'virtual' as const, deviceType: trezor ? 'trezor' : 'coldcard' };
  }
  async parseExternalSignerImport(encoded: string, label: string, source: ExternalSignerSource): Promise<ExternalSigner> {
    if (/xprv|tprv|seed|mnemonic/i.test(encoded)) throw new WalletError('private_material_rejected', 'Private material must stay on the signer.');
    const parsed = encoded.trim().startsWith('{') ? JSON.parse(encoded) : null;
    const fingerprint = parsed?.fingerprint ?? parsed?.xfp ?? 'f00dbabe';
    const xpub = parsed?.xpub ?? parsed?.bip84?.xpub ?? 'tpubD6NzVbkrYhZ4Y-fixture-external-public-key';
    const derivationPath = parsed?.derivationPath ?? parsed?.deriv ?? parsed?.bip84?.deriv ?? "m/84'/1'/0'";
    if (derivationPath.replaceAll('h', "'") !== "m/84'/1'/0'") throw new WalletError('invalid_derivation_path', "Use m/84'/1'/0'.");
    return { label: label.trim(), fingerprint: fingerprint.toLowerCase(), xpub, derivationPath: "m/84'/1'/0'", source, deviceType: null };
  }
  async importHardwareExternalSigner(deviceId: string, label: string, allowEmptyPassphrase = false): Promise<ExternalSigner> {
    const trezor = deviceId === 'virtual-trezor-standard' || deviceId === 'virtual-trezor';
    if (trezor && !allowEmptyPassphrase) throw new WalletError('hardware_wallet_selection_required', 'Choose whether this signer uses the standard wallet with no passphrase.');
    if (deviceId === 'virtual-trezor' && !this.#trezorPinUnlocked) throw new WalletError('hardware_unavailable', 'Unlock this Trezor before selecting its wallet.');
    const trezorFingerprint = deviceId === 'virtual-trezor' ? 'c0ffee03' : 'c0ffee02';
    return { label: label.trim(), fingerprint: trezor ? trezorFingerprint : 'f00dbabe', xpub: trezor ? 'tpubD6NzVbkrYhZ4Y-fixture-trezor-standard-public-key' : 'tpubD6NzVbkrYhZ4Y-fixture-external-public-key', derivationPath: "m/84'/1'/0'", source: 'usb', deviceType: trezor ? 'trezor' : 'coldcard' };
  }
  async createExternalSignerWallet(name: string, signer: ExternalSigner, credential: string): Promise<ExternalSignerWallet> {
    const profile: WalletProfile = { id: crypto.randomUUID(), name: name.trim(), network: defaultConfig.network, kind: 'watch_only', descriptorChecksum: 'extkey01', createdAt: Date.now() };
    this.#profiles.push(profile); this.#selectedWalletId = profile.id; this.#credentials.set(profile.id, credential); this.#unlockedWalletIds.add(profile.id); this.#exists = true;
    this.#externalWallet = { version: 1, name: profile.name, signer: { ...signer }, externalDescriptor: `wpkh([${signer.fingerprint}/84'/1'/0']${signer.xpub}/0/*)#fixture1`, internalDescriptor: `wpkh([${signer.fingerprint}/84'/1'/0']${signer.xpub}/1/*)#fixture2` };
    return structuredClone(this.#externalWallet);
  }
  async externalSignerWallet() {
    if (!this.#externalWallet || this.#profiles.find((profile) => profile.id === this.#selectedWalletId)?.kind !== 'watch_only') throw new WalletError('wallet_not_found', 'No external-signer wallet exists.');
    return structuredClone(this.#externalWallet);
  }
  async externalSignerProposals() { return structuredClone([...this.#externalProposals.values()]); }
  async importExternalSignerProposal(proposalId: string, _signedPsbt: string) {
    const proposal = this.#externalProposals.get(proposalId); if (!proposal) throw new WalletError('proposal_not_found', 'Proposal not found.');
    proposal.signed = 1; proposal.canFinalize = true; proposal.status = 'ready'; proposal.signedFingerprints = [this.#externalWallet?.signer.fingerprint ?? 'f00dbabe']; return structuredClone(proposal);
  }
  async signExternalWithHardware(proposalId: string, deviceId: string) { return this.importExternalSignerProposal(proposalId, deviceId); }
  async broadcastExternalSignerProposal(proposalId: string, credential: string) {
    if (!this.#selectedWalletId || credential !== this.#credentials.get(this.#selectedWalletId)) throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    const proposal = this.#externalProposals.get(proposalId); if (!proposal?.canFinalize) throw new WalletError('insufficient_signatures', 'Sign first.');
    this.#externalProposals.delete(proposalId); return { txid: '0a7bf3d7a98d8bc981975320eba8e9b8ac1aa92145dcf018e48c3c2f8c19e2aa', snapshot: await this.snapshot(), syncPending: false };
  }
  async cancelExternalSignerProposal(proposalId: string) { this.#externalProposals.delete(proposalId); }

  async previewMultisig(policy: PolicyDraft): Promise<MultisigPreview> {
    const errors = validatePolicyDraft(policy);
    if (errors.length) throw new WalletError('invalid_descriptor', errors[0]);
    const cosigners = policy.cosigners.map(normalizeCosigner);
    return {
      name: policy.name.trim(), threshold: policy.threshold, cosigners,
      externalDescriptor: descriptorPreview(policy.threshold, cosigners, 0),
      internalDescriptor: descriptorPreview(policy.threshold, cosigners, 1)
    };
  }

  async analyzeRecoveryPolicy(template: RecoveryTemplate, cosigners: PolicyDraft['cosigners']): Promise<RecoveryPolicyAnalysis> {
    const paths = template.type === 'recovery'
      ? [{ ...template.immediate, availableAfterBlocks: 0 }, template.recovery]
      : template.stages;
    if (paths.length < 2 || paths.some((path) => path.threshold < 1 || path.threshold > path.signerIds.length)) {
      throw new WalletError('unsafe_threshold', 'Every spending path needs a reachable threshold.');
    }
    const known = new Set(cosigners.map((key) => key.id));
    if (paths.some((path) => path.signerIds.some((id) => !known.has(id)))) throw new WalletError('unknown_signer', 'A spending path contains an unknown signer.');
    if (template.type === 'recovery' && template.recovery.signerIds.some((id) => template.immediate.signerIds.includes(id))) throw new WalletError('recovery_signer_reused', 'The recovery signer must be independent from every immediate-path signer.');
    if (paths.slice(1).some((path, index) => path.availableAfterBlocks <= paths[index].availableAfterBlocks)) throw new WalletError('invalid_timeline', 'Recovery delays must increase.');
    return {
      externalDescriptor: `wsh(${template.type}-policy/0/*)#prototype`,
      internalDescriptor: `wsh(${template.type}-policy/1/*)#prototype`,
      paths,
      warnings: template.type === 'decaying' ? [{ code: 'reduced_theft_resistance', message: 'Later paths require fewer signatures and intentionally reduce theft resistance.' }] : [],
      maxSatisfactionWeight: 420
    };
  }

  async createMultisig(policy: PolicyDraft, credential: string): Promise<MultisigWallet> {
    if (!credential) throw new WalletError('invalid_credential', 'An app PIN is required.');
    const preview = await this.previewMultisig(policy);
    this.#recoveryVerified = false;
    this.#multisig = { ...preview, kind: 'multisig', createdAt: new Date().toISOString(), policyType: 'standard' };
    this.#multisigCredential = credential;
    if (this.#multisigProfileId) { this.#profiles = this.#profiles.filter((wallet) => wallet.id !== this.#multisigProfileId); this.#credentials.delete(this.#multisigProfileId); this.#unlockedWalletIds.delete(this.#multisigProfileId); }
    const profile = { id: crypto.randomUUID(), name: this.#multisig.name, network: defaultConfig.network, kind: 'multisig' as const, descriptorChecksum: 'multisig', createdAt: Date.now() };
    this.#profiles.push(profile); this.#multisigProfileId = profile.id; this.#selectedWalletId = profile.id; this.#credentials.set(profile.id, credential); this.#unlockedWalletIds.add(profile.id); this.#exists = true;
    return structuredClone(this.#multisig);
  }

  async createRecoveryMultisig(name: string, template: RecoveryTemplate, cosigners: PolicyDraft['cosigners'], credential: string): Promise<MultisigWallet> {
    if (!credential) throw new WalletError('invalid_credential', 'An app PIN is required.');
    const analysis = await this.analyzeRecoveryPolicy(template, cosigners);
    this.#recoveryVerified = false;
    this.#multisig = { kind: 'multisig', name: name.trim(), threshold: analysis.paths[0].threshold, cosigners, externalDescriptor: analysis.externalDescriptor, internalDescriptor: analysis.internalDescriptor, createdAt: new Date().toISOString(), policyType: 'recovery', recoveryTemplate: template, spendingPaths: analysis.paths };
    this.#multisigCredential = credential;
    if (this.#multisigProfileId) { this.#profiles = this.#profiles.filter((wallet) => wallet.id !== this.#multisigProfileId); this.#credentials.delete(this.#multisigProfileId); this.#unlockedWalletIds.delete(this.#multisigProfileId); }
    const profile = { id: crypto.randomUUID(), name: this.#multisig.name, network: defaultConfig.network, kind: 'multisig' as const, descriptorChecksum: 'recovery', createdAt: Date.now() };
    this.#profiles.push(profile); this.#multisigProfileId = profile.id; this.#selectedWalletId = profile.id; this.#credentials.set(profile.id, credential); this.#unlockedWalletIds.add(profile.id); this.#exists = true;
    return structuredClone(this.#multisig);
  }

  async multisigWallet() { return this.#multisig ? structuredClone(this.#multisig) : null; }
  async exportMultisig(credential: string) {
    if (!this.#multisig) throw new WalletError('wallet_not_found', 'No multisig wallet exists.');
    if (credential !== this.#multisigCredential) throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    return JSON.stringify({ version: 1, network: defaultConfig.network, wallet: this.#multisig }, null, 2);
  }
  async exportMultisigBsms(credential: string) {
    if (!this.#multisig) throw new WalletError('wallet_not_found', 'No multisig wallet exists.');
    if (credential !== this.#multisigCredential) throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    const template = this.#multisig.externalDescriptor.split('#')[0].replaceAll('/0/*', '/**');
    return `BSMS 1.0\n${template}\n/0/*,/1/*\n${addressPrefixForNetwork(defaultConfig.network)}qdummy5n8k2r7v4cx9s6jlawephgzuqf5t8ul\n`;
  }
  async savePublicBackup(suggestedFilename: string, content: string) {
    const { downloadText } = await import('$lib/transfer');
    downloadText(suggestedFilename, content);
    return true;
  }
  async printPublicBackup() { window.print(); }
  async inspectMultisigBsms(encodedBackup: string) {
    const lines = encodedBackup.trimEnd().split('\n');
    if (lines.length !== 4 || lines[0] !== 'BSMS 1.0' || lines[2] !== '/0/*,/1/*') {
      throw new WalletError('invalid_backup', 'Enter a valid BSMS 1.0 descriptor record.');
    }
    const currentTemplate = this.#multisig?.externalDescriptor.split('#')[0].replaceAll('/0/*', '/**');
    const matchesCurrentWallet = currentTemplate === lines[1];
    this.#recoveryVerified = matchesCurrentWallet;
    return { firstAddress: lines[3], matchesCurrentWallet };
  }
  async recoverMultisigBsms(name: string, encodedBackup: string, credential: string) {
    await this.inspectMultisigBsms(encodedBackup);
    if (!name.trim()) throw new WalletError('invalid_wallet_name', 'Enter a wallet name.');
    if (!credential) throw new WalletError('invalid_credential', 'An app PIN is required.');
    const recovered = fixtureMultisigWallet();
    recovered.name = name.trim();
    recovered.createdAt = new Date().toISOString();
    this.#multisig = recovered;
    this.#multisigCredential = credential;
    const profile = { id: crypto.randomUUID(), name: recovered.name, network: defaultConfig.network, kind: 'multisig' as const, descriptorChecksum: 'bsms-restored', createdAt: Date.now() };
    this.#profiles.push(profile); this.#multisigProfileId = profile.id; this.#selectedWalletId = profile.id; this.#credentials.set(profile.id, credential); this.#exists = true;
    return structuredClone(recovered);
  }
  async recoveryDrill(encodedBackup: string) {
    try { const parsed = JSON.parse(encodedBackup); const matchesCurrentWallet = parsed?.wallet?.externalDescriptor === this.#multisig?.externalDescriptor; this.#recoveryVerified = matchesCurrentWallet; return { firstAddress: `${addressPrefixForNetwork(defaultConfig.network)}qdummy5n8k2r7v4cx9s6jlawephgzuqf5t8ul`, matchesCurrentWallet }; }
    catch { throw new WalletError('invalid_backup', 'Enter a valid Satchel descriptor backup.'); }
  }
  async recoverMultisig(encodedBackup: string, credential: string) {
    if (this.#multisig) throw new WalletError('wallet_already_exists', 'Delete the current multisig wallet before recovering another one.');
    try { const parsed = JSON.parse(encodedBackup); if (parsed?.version !== 1 || parsed?.network !== defaultConfig.network || !parsed.wallet) throw new Error(); this.#recoveryVerified = false; this.#multisig = parsed.wallet; this.#multisigCredential = credential; const profile = { id: crypto.randomUUID(), name: this.#multisig!.name, network: defaultConfig.network, kind: 'multisig' as const, descriptorChecksum: 'restored', createdAt: Date.now() }; this.#profiles.push(profile); this.#multisigProfileId = profile.id; this.#selectedWalletId = profile.id; this.#credentials.set(profile.id, credential); this.#unlockedWalletIds.add(profile.id); this.#exists = true; return structuredClone(this.#multisig!); }
    catch { throw new WalletError('invalid_backup', 'Enter a valid Satchel descriptor backup.'); }
  }
  async deleteMultisig(credential: string, confirmation: string) {
    if (!this.#multisig) throw new WalletError('wallet_not_found', 'No multisig wallet exists.');
    if (!this.#recoveryVerified) throw new WalletError('backup_mismatch', 'Run a successful recovery drill before deleting this coordinator.');
    if (confirmation !== this.#multisig.name) throw new WalletError('confirmation_mismatch', 'Type the exact wallet name to delete this coordinator.');
    if (credential !== this.#multisigCredential) throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (this.#multisigProfileId) { this.#profiles = this.#profiles.filter((wallet) => wallet.id !== this.#multisigProfileId); this.#credentials.delete(this.#multisigProfileId); this.#unlockedWalletIds.delete(this.#multisigProfileId); }
    this.#selectedWalletId = this.#profiles[0]?.id ?? null; this.#exists = this.#profiles.length > 0;
    this.#multisig = null; this.#multisigCredential = ''; this.#multisigProfileId = null; this.#multisigProposals.clear(); this.#recoveryVerified = false;
  }
  async multisigSnapshot() { return this.snapshot(); }
  async syncMultisig() { return this.snapshot(); }
  async createMultisigAddress(label: string) { return this.createAddress(label); }
  async discardMultisigAddress(id: number) { return this.discardAddress(id); }
  async encodePsbtUr(psbt: string, fragmentBytes = 180) {
    const payload = btoa(psbt);
    const chunks = Array.from({ length: Math.ceil(payload.length / fragmentBytes) }, (_, index) => payload.slice(index * fragmentBytes, (index + 1) * fragmentBytes));
    if (chunks.length === 1) return [`ur:crypto-psbt/${chunks[0]}`];
    return chunks.map((chunk, index) => `ur:crypto-psbt/${index + 1}of${chunks.length}/${chunk}`);
  }
  async decodePsbtUr(frames: string[]) {
    if (!frames.length) throw new WalletError('internal_error', 'Scan at least one crypto-psbt frame.');
    const multipart = frames.map((frame) => {
      const parts = frame.split('/');
      const sequence = /^(\d+)of(\d+)$/.exec(parts.at(-2) ?? '');
      return sequence ? { index: Number(sequence[1]), total: Number(sequence[2]), payload: parts.at(-1) ?? '' } : null;
    });
    if (multipart.every((part) => part === null)) return atob(frames[0].split('/').at(-1) ?? '');
    const parts = multipart.filter((part): part is NonNullable<typeof part> => part !== null);
    const total = parts[0]?.total ?? 0;
    if (parts.length < total) throw new WalletError('internal_error', `Keep scanning (${parts.length} of ${total} frames).`);
    return atob(parts.sort((a, b) => a.index - b.index).map((part) => part.payload).join(''));
  }
  async prepareMultisigPayment(recipient: string, rawLabel: string, amount: ReturnType<typeof sats>, selectedRate: ReturnType<typeof feeRate>, coinSelection: CoinSelection = { mode: 'auto' }) {
    if (!this.#multisig) throw new WalletError('wallet_not_found', 'Create a multisig wallet first.');
    if (!hasAddressPrefixForNetwork(recipient, defaultConfig.network)) throw new WalletError('invalid_address', 'Recipient must match the active Bitcoin network.');
    const label = normalizePermanentLabel(rawLabel);
    const fee = sats(Math.ceil(Number(selectedRate) * 220));
    const spendable = this.#coins.filter((coin) => !coin.frozen && (coinSelection.mode === 'auto' || coinSelection.outpoints.includes(coin.outpoint)));
    const available = spendable.reduce((total, coin) => total + coin.amount, 0);
    if (Number(amount) + Number(fee) > available) throw new WalletError('insufficient_funds', 'Amount and fee exceed the selected, unfrozen balance.');
    const selectedOutpoints = coinSelection.mode === 'manual' ? spendable.map((coin) => coin.outpoint) : [];
    const proposal: MultisigProposal = { proposalId: crypto.randomUUID(), recipient, label, amount, fee, feeRate:selectedRate, total:sats(Number(amount)+Number(fee)), selectedOutpoints, psbt:`cHNidP8BAF9kdW1teQ==${'A'.repeat(3120)}`, signed:0, required:this.#multisig.threshold, canFinalize:false, signedFingerprints:[], status:'collecting', createdAt:new Date().toISOString() };
    this.#multisigProposals.set(proposal.proposalId, proposal); return structuredClone(proposal);
  }
  async prepareMultisigAcceleration(txid: string, method: import('./contracts').AccelerationMethod, selectedRate: ReturnType<typeof feeRate>) { const base=await this.prepareAcceleration(txid,method,selectedRate); const proposal:MultisigProposal={...base,psbt:'cHNidP8BAFICAAAA',signed:0,required:this.#multisig?.threshold??2,canFinalize:false,signedFingerprints:[],status:'collecting',createdAt:new Date().toISOString()};this.#multisigProposals.set(proposal.proposalId,proposal);return structuredClone(proposal); }
  async multisigProposals() { return [...this.#multisigProposals.values()].filter((item)=>item.status==='collecting'||item.status==='ready').map((item)=>structuredClone(item)); }
  async importMultisigProposal(proposalId:string, signedPsbt:string) {
    if (!signedPsbt.trim()) throw new WalletError('internal_error','Enter a signed PSBT.');
    return this.#addDummySignature(proposalId);
  }
  async signMultisigWithHardware(proposalId:string, deviceId:string) {
    if (deviceId === 'virtual-ledger-outsider') throw new WalletError('unknown_signer','The connected device is not a cosigner in this wallet policy.');
    return this.#addDummySignature(proposalId);
  }
  async broadcastMultisigProposal(proposalId:string, credential:string) {
    const proposal=this.#multisigProposals.get(proposalId); if(!proposal) throw new WalletError('proposal_not_found','Payment proposal was not found.');
    if(credential!==this.#multisigCredential) throw new WalletError('invalid_credential','Incorrect app PIN.');
    if(!proposal.canFinalize) throw new WalletError('internal_error','Collect the required signatures first.');
    proposal.status='broadcast'; this.#balance=Math.max(0,this.#balance-Number(proposal.total)); const txid='7d4a2c7f9e317f9859d7a8566fe02d773afb09fcddb617dbda98bfba8f721234'; return {txid,snapshot:await this.snapshot(),syncPending:false};
  }
  async cancelMultisigProposal(proposalId:string) { const proposal=this.#multisigProposals.get(proposalId); if(!proposal) throw new WalletError('proposal_not_found','Payment proposal was not found.'); proposal.status='cancelled'; }
  async savePsbt(suggestedFilename:string,psbt:string){const {downloadText}=await import('$lib/transfer');downloadText(suggestedFilename,psbt);return true;}

  #addDummySignature(proposalId:string) {
    const proposal=this.#multisigProposals.get(proposalId); if(!proposal||!this.#multisig) throw new WalletError('proposal_not_found','Payment proposal was not found.');
    const next=this.#multisig.cosigners.find((key)=>!proposal.signedFingerprints.includes(key.fingerprint)); if(next) proposal.signedFingerprints.push(next.fingerprint);
    proposal.signed=proposal.signedFingerprints.length; proposal.canFinalize=proposal.signed>=proposal.required; proposal.status=proposal.canFinalize?'ready':'collecting'; return structuredClone(proposal);
  }

  subscribe(listener: (event: WalletEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: WalletEvent) { this.#listeners.forEach((listener) => listener(event)); }
}
