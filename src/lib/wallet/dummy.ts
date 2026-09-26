import { APP_VERSION, defaultConfig, transactionExplorerUrl } from '$lib/config';
import type { ReceiveAddress, Transaction } from '$lib/types';
import {
  addressPrefixForNetwork,
  canDiscardAddress,
  hasAddressPrefixForNetwork,
  INACTIVITY_TIMEOUT_CHOICES,
  normalizePermanentLabel
} from './policy';
import {
  feeRate,
  MAX_SUPPLEMENTAL_COIN_FLIPS,
  MAX_SUPPLEMENTAL_DICE_ROLLS,
  MIN_SUPPLEMENTAL_COIN_FLIPS,
  MIN_SUPPLEMENTAL_DICE_ROLLS,
  sats,
  WalletError,
  type CoinSelection,
  type CoinSelectionPreview,
  type FeeEstimates,
  type PaymentProposal,
  type WalletEvent,
  type WalletPort,
  type WalletSnapshot
} from './contracts';
import type {
  CoreNodeConfig,
  CosignerHealthCheck,
  ExternalSigner,
  ExternalSignerSource,
  ExternalSignerWallet,
  HardwareHealthCheckRecord,
  MultisigPreview,
  MultisigProposal,
  MultisigWallet,
  RecoveryPolicyAnalysis,
  RecoveryTemplate,
  SignerPolicyVerification,
  WalletProfile,
  WalletSyncSource
} from './contracts';
import type { PolicyDraft } from '$lib/multisig/policy';
import {
  descriptorPreview,
  MULTISIG_ACCOUNT_PATH,
  normalizeCosigner,
  normalizeSignerLabel,
  validatePolicyDraft
} from '$lib/multisig/policy';
import { policyReadinessKind } from '$lib/hardware/policy-readiness';
import {
  MAX_WALLET_PASSPHRASE_BYTES,
  MIN_NEW_WALLET_PASSPHRASE_CHARACTERS,
  unicodeCharacterLength,
  utf8ByteLength
} from '$lib/mnemonic-verification';

import {
  DummyWalletState,
  fixtureAddressForNetwork,
  fixtureCosigners,
  fixtureMultisigWallet,
  prototypeCredential
} from './dummy-state';
import type { PaymentDraft } from './payment-draft';
import { pendingBalanceBreakdown, sortTransactions } from './presentation';

export class DummyWalletAdapter extends DummyWalletState implements WalletPort {
  private multisigSetupDraftValue: import('./contracts').MultisigSetupDraft | null = null;
  private paymentDrafts = new Map<string, PaymentDraft>();
  private multisigPolicyVerificationRecords: SignerPolicyVerification[] = [];
  private hardwareHealthCheckRecords = new Map<string, HardwareHealthCheckRecord>();
  private detailFixtureFailed = false;
  private activityFixtureFailed = false;
  async paymentDraft() {
    if (typeof location !== 'undefined') {
      const params = new URLSearchParams(location.search);
      if (params.has('fixture-delayed-wallet-details'))
        await new Promise((resolve) => setTimeout(resolve, 1500));
      if (params.has('fixture-wallet-details-error') && !this.detailFixtureFailed) {
        this.detailFixtureFailed = true;
        throw new WalletError('internal_error', 'Synthetic wallet details failure.');
      }
    }
    const draft = this._selectedWalletId ? this.paymentDrafts.get(this._selectedWalletId) : null;
    return draft ? structuredClone(draft) : null;
  }
  async diagnostics() {
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-delayed-diagnostics')
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const records = [
      {
        schemaVersion: 1 as const,
        timestamp: timestamp - 120,
        event: 'receive_address_generated' as const,
        outcome: 'succeeded' as const,
        trigger: 'manual' as const,
        walletKind: 'software' as const,
        itemCount: 1,
        appVersion: APP_VERSION,
        buildCommit: 'development',
        compiledNetwork: defaultConfig.network,
        platform: 'browser' as const
      },
      {
        schemaVersion: 1 as const,
        timestamp: timestamp - 60,
        event: 'receive_address_discarded' as const,
        outcome: 'succeeded' as const,
        trigger: 'manual' as const,
        walletKind: 'software' as const,
        appVersion: APP_VERSION,
        buildCommit: 'development',
        compiledNetwork: defaultConfig.network,
        platform: 'browser' as const
      },
      {
        schemaVersion: 1 as const,
        timestamp,
        event: 'app_started' as const,
        outcome: 'succeeded' as const,
        trigger: 'startup' as const,
        appVersion: APP_VERSION,
        buildCommit: 'development',
        compiledNetwork: defaultConfig.network,
        platform: 'browser' as const
      },
      {
        schemaVersion: 1 as const,
        timestamp: timestamp - 30,
        event: 'recovery_scan' as const,
        outcome: 'failed' as const,
        trigger: 'recovery' as const,
        walletKind: 'software' as const,
        syncSource: 'bitcoin_core' as const,
        errorCode: 'node_history_unavailable',
        errorMessage:
          'Bitcoin Core has pruned a block required by this scan. The attached block heights identify the unavailable range and earliest usable birthday.',
        errorDetails: {
          requestedBirthdayBlock: 96_600,
          requiredBlock: 96_599,
          earliestRetainedBlock: 960_062,
          minimumBirthdayBlock: 960_063
        },
        appVersion: APP_VERSION,
        buildCommit: 'development',
        compiledNetwork: defaultConfig.network,
        platform: 'browser' as const
      }
    ];
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-large-diagnostics')
    ) {
      return Array.from({ length: 2000 }, (_, index) => ({
        ...records[index % records.length],
        timestamp: timestamp - index,
        itemCount: index
      }));
    }
    return records;
  }
  async exportDiagnostics(_format: 'json' | 'csv') {
    return {
      saved: true,
      revealToken: 'fixture-diagnostics-export-reveal',
      revealLabel: 'Show in Finder'
    };
  }
  async savePaymentDraft(draft: PaymentDraft) {
    if (!this._selectedWalletId || draft.walletId !== this._selectedWalletId)
      throw new WalletError('wallet_not_found', 'The payment draft belongs to another wallet.');
    this.paymentDrafts.set(draft.walletId, structuredClone(draft));
    return structuredClone(draft);
  }
  async clearPaymentDraft() {
    if (this._selectedWalletId) this.paymentDrafts.delete(this._selectedWalletId);
  }
  async runtimePlatform() {
    return {
      platform: 'browser' as const,
      mobile: false,
      network: defaultConfig.network,
      networkSwitching: false,
      version: APP_VERSION,
      commit: 'development'
    };
  }
  async switchNetwork(_network: import('$lib/config').SwitchableNetwork) {
    throw new WalletError(
      'network_switch_unavailable',
      'Network switching is available only in the native multi-network build.'
    );
  }
  async exists() {
    return this._exists;
  }
  async profiles() {
    return {
      version: 1,
      selectedWalletId: this._selectedWalletId,
      wallets: structuredClone(this._profiles),
      inactivityTimeoutMinutes: this._inactivityTimeoutMinutes
    };
  }
  async profileCompatibility() {
    return { supported: true };
  }
  async renameWallet(name: string) {
    if (!this._selectedWalletId || !this._unlockedWalletIds.has(this._selectedWalletId)) {
      throw new WalletError('wallet_locked', 'Unlock this wallet before renaming it.');
    }
    const normalized = name.trim();
    if (!normalized || [...normalized].length > 48) {
      throw new WalletError('invalid_wallet_name', 'Wallet names must contain 1 to 48 characters.');
    }
    const profile = this._profiles.find((wallet) => wallet.id === this._selectedWalletId);
    if (!profile) throw new WalletError('wallet_not_found', 'The selected wallet does not exist.');
    profile.name = normalized;
    const renamed = structuredClone(profile);
    this.#emit({ type: 'wallet_profile_updated', profile: renamed });
    return renamed;
  }
  async saveInactivityTimeout(minutes: number) {
    if (!this._selectedWalletId || !this._unlockedWalletIds.has(this._selectedWalletId)) {
      throw new WalletError('wallet_locked', 'Unlock this wallet before changing automatic lock.');
    }
    if (!INACTIVITY_TIMEOUT_CHOICES.includes(minutes)) {
      throw new WalletError(
        'invalid_inactivity_timeout',
        'Automatic lock must be 1, 5, 15, 30, or 60 minutes.'
      );
    }
    this._inactivityTimeoutMinutes = minutes;
    return this.profiles();
  }
  async session() {
    const profile = this._profiles.find((wallet) => wallet.id === this._selectedWalletId);
    if (!profile) throw new WalletError('wallet_not_found', 'The selected wallet does not exist.');
    return {
      profile: structuredClone(profile),
      unlocked: this._unlockedWalletIds.has(profile.id)
    };
  }
  async selectWallet(walletId: string) {
    const profile = this._profiles.find((wallet) => wallet.id === walletId);
    if (!profile) throw new WalletError('wallet_not_found', 'The selected wallet does not exist.');
    this._selectedWalletId = walletId;
    return {
      profile: structuredClone(profile),
      unlocked: this._unlockedWalletIds.has(walletId)
    };
  }
  async generateMnemonic(supplementalEntropy?: import('./contracts').SupplementalEntropyInput) {
    if (supplementalEntropy) {
      const { source, outcomes } = supplementalEntropy;
      const valid = source === 'coin' ? /^[HT]+$/.test(outcomes) : /^[1-6]+$/.test(outcomes);
      const withinBounds =
        source === 'coin'
          ? outcomes.length >= MIN_SUPPLEMENTAL_COIN_FLIPS &&
            outcomes.length <= MAX_SUPPLEMENTAL_COIN_FLIPS
          : outcomes.length >= MIN_SUPPLEMENTAL_DICE_ROLLS &&
            outcomes.length <= MAX_SUPPLEMENTAL_DICE_ROLLS;
      if (!valid || !withinBounds)
        throw new WalletError(
          'invalid_supplemental_entropy',
          'Enter the required physical coin flips or dice rolls.'
        );
    }
    return {
      mode: 'fixture' as const,
      words:
        'adapt cactus lesson motor acoustic globe ribbon pluck vessel deputy crisp fossil harbor pencil drift copper museum twelve gentle oak fabric north silent width'.split(
          ' '
        )
    };
  }
  async cancelOnboarding(_preserveMainnetAdmission = false) {}
  async createWallet(
    name: string,
    credential: string,
    backupVerified: boolean,
    _networkSetupSourceWalletId?: string
  ) {
    // Keep the browser adapter asynchronous enough to exercise the same
    // painted loading state as native profile encryption and persistence.
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!name.trim()) throw new WalletError('invalid_wallet_name', 'A wallet name is required.');
    if (!credential) throw new WalletError('invalid_credential', 'A passphrase / PIN is required.');
    if (unicodeCharacterLength(credential) < MIN_NEW_WALLET_PASSPHRASE_CHARACTERS)
      throw new WalletError(
        'invalid_credential',
        'New wallet passphrases must contain at least 16 characters.'
      );
    if (utf8ByteLength(credential) > MAX_WALLET_PASSPHRASE_BYTES)
      throw new WalletError('invalid_credential', 'The wallet passphrase is too long.');
    const profile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      network: defaultConfig.network,
      kind: 'single_key' as const,
      descriptorChecksum: crypto.randomUUID().replaceAll('-', '').slice(0, 8),
      createdAt: Date.now(),
      backupVerified
    };
    this._profiles.push(profile);
    this._selectedWalletId = profile.id;
    this._credentials.set(profile.id, credential);
    this._unlockedWalletIds.add(profile.id);
    this._exists = true;
    return {
      masterFingerprint: '0fe7e3d2',
      externalDescriptor: "wpkh([0fe7e3d2/84'/1'/0']tpub-groot-demo/0/*)#c4z9ljqv",
      internalDescriptor: "wpkh([0fe7e3d2/84'/1'/0']tpub-groot-demo/1/*)#xkgxenf9",
      networkSetupCopied: true
    };
  }
  async recoverWallet(_name: string, _credential: string) {
    throw new WalletError(
      'secure_storage_unavailable',
      'Recovery words must be entered in Groot desktop’s native recovery window.'
    );
  }
  async verifyBackup(credential: string) {
    const profile = this._profiles.find((wallet) => wallet.id === this._selectedWalletId);
    if (!profile || profile.kind !== 'single_key')
      throw new WalletError('wrong_wallet_kind', 'Select a software wallet first.');
    if (this._credentials.get(profile.id) !== credential)
      throw new WalletError('invalid_credential', 'Incorrect passphrase / PIN.');
    profile.backupVerified = true;
    return true;
  }
  async revealAndVerifyBackup(credential: string) {
    return this.verifyBackup(credential);
  }
  async unlock(credential: string) {
    if (this._secureStorageRetryPending) {
      this._secureStorageRetryPending = false;
      throw new WalletError(
        'secure_storage_unavailable',
        "Encrypted wallet storage is unavailable. Check access to Groot's application data and try again. The wallet stayed locked."
      );
    }
    const expected = this._selectedWalletId
      ? this._credentials.get(this._selectedWalletId)
      : undefined;
    if (credential !== expected)
      throw new WalletError('invalid_credential', 'Incorrect passphrase / PIN.');
    if (this._selectedWalletId) this._unlockedWalletIds.add(this._selectedWalletId);
  }
  async lock() {
    if (this._selectedWalletId) this._unlockedWalletIds.delete(this._selectedWalletId);
  }
  async deleteWallet(credential: string, confirmation: string) {
    if (confirmation !== 'DELETE')
      throw new WalletError('confirmation_mismatch', 'Type DELETE exactly.');
    const expected = this._selectedWalletId
      ? this._credentials.get(this._selectedWalletId)
      : undefined;
    if (credential !== expected)
      throw new WalletError('invalid_credential', 'Incorrect passphrase / PIN.');
    if (this._selectedWalletId) {
      this._profiles = this._profiles.filter((wallet) => wallet.id !== this._selectedWalletId);
      this._credentials.delete(this._selectedWalletId);
      this._unlockedWalletIds.delete(this._selectedWalletId);
      if (this._selectedWalletId === this._multisigProfileId) {
        this._multisig = null;
        this._multisigCredential = '';
        this._multisigProfileId = null;
        this._multisigProposals.clear();
      }
    }
    this._selectedWalletId = this._profiles[0]?.id ?? null;
    this._exists = this._profiles.length > 0;
    this._proposals.clear();
  }
  async resetRegtestWallet(confirmation: string) {
    if (confirmation !== 'RESET REGTEST')
      throw new WalletError('confirmation_mismatch', 'Type RESET REGTEST exactly.');
    if (this._selectedWalletId) {
      this._profiles = this._profiles.filter((wallet) => wallet.id !== this._selectedWalletId);
      this._credentials.delete(this._selectedWalletId);
      this._unlockedWalletIds.delete(this._selectedWalletId);
    }
    this._selectedWalletId = this._profiles[0]?.id ?? null;
    this._exists = this._profiles.length > 0;
    this._proposals.clear();
  }
  async multisigSetupDraft() {
    return structuredClone(this.multisigSetupDraftValue);
  }
  async saveMultisigSetupDraft(draft: import('./contracts').MultisigSetupDraft) {
    this.multisigSetupDraftValue = structuredClone({
      ...draft,
      version: 1,
      updatedAt: Math.floor(Date.now() / 1000)
    });
    return structuredClone(this.multisigSetupDraftValue);
  }
  async discardMultisigSetupDraft() {
    this.multisigSetupDraftValue = null;
  }
  async nodeConfig() {
    return structuredClone(this._nodeConfig);
  }
  async publicNetworkStatus() {
    return { priorityFee: 12, networkTip: 301 };
  }
  async admitMainnetCore(
    config: CoreNodeConfig,
    password: string,
    _purpose: 'open_existing_wallet' | 'create_new_wallet'
  ) {
    if (config.auth === 'user_pass' && !password)
      throw new WalletError('invalid_node_config', 'RPC password is required.');
    this._nodeConfig = { ...config, backend: { ...config.backend } };
    return this.testNodeConnection();
  }
  async networkSetupSources() {
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-no-network-setup')
    )
      return [];
    const lockReusableSources =
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-locked-network-source');
    return this._profiles.map((profile) => ({
      walletId: profile.id,
      walletName: profile.name,
      ready:
        this._unlockedWalletIds.has(profile.id) &&
        (!lockReusableSources || profile.id === this._selectedWalletId)
    }));
  }
  async adoptNetworkSetup(sourceWalletId: string, credential: string) {
    if (!this._profiles.some((profile) => profile.id === sourceWalletId))
      throw new WalletError('wallet_not_found', 'The source wallet no longer exists.');
    if (!this._selectedWalletId || credential !== this._credentials.get(this._selectedWalletId))
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    return this.testNodeConnection();
  }
  async configureManagedNode(credential: string) {
    if (!this._selectedWalletId || credential !== this._credentials.get(this._selectedWalletId))
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    this._nodeConfig = {
      backend: { type: 'remote_core', url: 'https://bitcoin-rpc.usegroot.com/' },
      auth: 'user_pass',
      username: 'groot-0123456789abcdef01234567',
      torProxy: null
    };
    return this.testNodeConnection();
  }
  async saveNodeConfig(config: CoreNodeConfig, password: string, credential: string) {
    if (!this._selectedWalletId || credential !== this._credentials.get(this._selectedWalletId))
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (config.auth === 'user_pass' && !password)
      throw new WalletError('internal_error', 'RPC password is required.');
    this._nodeConfig = { ...config, backend: { ...config.backend } };
    return {
      connected: true,
      blocks: 301,
      backend: { ...config, backend: { ...config.backend } },
      pruned: false,
      pruneHeight: null,
      initialBlockDownload: false,
      sizeOnDisk: 42_000_000,
      blockFilterIndex: 'disabled' as const
    };
  }
  async testNodeConnection() {
    return {
      connected: true,
      blocks: 301,
      backend: structuredClone(this._nodeConfig),
      pruned: false,
      pruneHeight: null,
      initialBlockDownload: false,
      sizeOnDisk: 42_000_000,
      blockFilterIndex: 'disabled' as const
    };
  }
  async syncSource() {
    return structuredClone(this._syncSource);
  }
  async syncStatus() {
    return null;
  }
  async saveSyncSource(source: WalletSyncSource, credential: string) {
    if (!this._selectedWalletId || credential !== this._credentials.get(this._selectedWalletId))
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    this._syncSource = structuredClone(source);
    return structuredClone(this._syncSource);
  }
  async inspectPaymentRequest(
    _value: string
  ): Promise<import('./contracts').PaymentRequestInspection> {
    throw new WalletError(
      'invalid_payment_request',
      'The browser fixture does not run trusted payment-request parsing.'
    );
  }
  async recoveryScanSettings() {
    return { ...this._scanSettings };
  }
  async saveRecoveryScanSettings(birthdayHeight: number, gapLimit: number, credential: string) {
    const initialFixtureScan = !this._initialHistoryCompleted && this._initialHistoryRequired;
    if (
      !this._selectedWalletId ||
      (credential !== this._credentials.get(this._selectedWalletId) &&
        !(initialFixtureScan && credential === ''))
    )
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (
      !Number.isInteger(birthdayHeight) ||
      birthdayHeight < 0 ||
      !Number.isInteger(gapLimit) ||
      gapLimit < 20 ||
      gapLimit > 1000
    )
      throw new WalletError('internal_error', 'Invalid recovery scan settings.');
    this._scanSettings = { birthdayHeight, gapLimit };
    return { ...this._scanSettings };
  }
  async recoveryScanStatus() {
    return structuredClone(this._scanStatus);
  }
  async fullRescan(credential: string) {
    const initialFixtureScan = !this._initialHistoryCompleted && this._initialHistoryRequired;
    if (
      !this._selectedWalletId ||
      (credential !== this._credentials.get(this._selectedWalletId) &&
        !(initialFixtureScan && credential === ''))
    )
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (this._scanStatus.status === 'running' || this._scanStatus.status === 'cancelling')
      throw new WalletError(
        'scan_in_progress',
        'A recovery scan is already running for this wallet.'
      );
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-pruned-history')
    )
      throw new WalletError(
        'node_history_unavailable',
        'Bitcoin Core no longer stores the blocks needed for this scan. Choose a birthday above the retained prune height, or connect an archival node.',
        null,
        {
          requestedBirthdayBlock: this._scanSettings.birthdayHeight,
          requiredBlock: Math.max(0, this._scanSettings.birthdayHeight - 1),
          earliestRetainedBlock: 960_062,
          minimumBirthdayBlock: 960_063
        }
      );
    const startedAt = Math.floor(Date.now() / 1000);
    const totalBlocks = 8;
    this._scanStatus = {
      status: 'running',
      ...this._scanSettings,
      currentHeight: this._scanSettings.birthdayHeight,
      targetHeight: 301,
      processedBlocks: 0,
      totalBlocks,
      startedAt,
      updatedAt: startedAt
    };
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-recovery-scan-failure')
    ) {
      this._scanStatus = {
        ...this._scanStatus,
        status: 'failed',
        currentHeight: this._scanSettings.birthdayHeight,
        processedBlocks: 1,
        updatedAt: Math.floor(Date.now() / 1000)
      };
      throw new WalletError('internal_error', 'The recovery scan could not be completed.');
    }
    const holdForCancellation = this._holdFirstRecoveryScan && this._recoveryScanAttempts === 0;
    this._recoveryScanAttempts += 1;
    while (holdForCancellation && this._scanStatus.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    for (let processedBlocks = 1; processedBlocks <= totalBlocks; processedBlocks += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (this._scanStatus.status === 'cancelling') {
        this._scanStatus = {
          status: 'idle',
          ...this._scanSettings,
          currentHeight: 0,
          targetHeight: 0,
          processedBlocks: 0,
          totalBlocks: 0,
          startedAt: 0,
          updatedAt: 0
        };
        throw new WalletError(
          'scan_cancelled',
          'Recovery scan cancelled. Start a new scan when you are ready.'
        );
      }
      this._scanStatus = {
        ...this._scanStatus,
        currentHeight: Math.floor((301 * processedBlocks) / totalBlocks),
        processedBlocks,
        updatedAt: Math.floor(Date.now() / 1000)
      };
    }
    this._scanStatus = {
      ...this._scanStatus,
      status: 'completed',
      currentHeight: 301,
      updatedAt: Math.floor(Date.now() / 1000)
    };
    this._initialHistoryCompleted = true;
    return this.snapshot();
  }
  async cancelFullRescan() {
    if (this._scanStatus.status !== 'running')
      throw new WalletError('scan_not_running', 'There is no active recovery scan to cancel.');
    this._scanStatus = {
      ...this._scanStatus,
      status: 'cancelling',
      updatedAt: Math.floor(Date.now() / 1000)
    };
    return structuredClone(this._scanStatus);
  }

  async snapshot(): Promise<WalletSnapshot> {
    const walletId = this._selectedWalletId;
    if (!walletId || !this._unlockedWalletIds.has(walletId)) {
      throw new WalletError('wallet_locked', 'This wallet is locked.');
    }
    const emptyActivity =
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-empty-activity');
    const emptyWallet =
      (typeof location !== 'undefined' &&
        new URLSearchParams(location.search).has('fixture-empty-wallet')) ||
      (this._delayedWalletSwitch && walletId === this._multisigProfileId);
    const pendingSelfSpend =
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-pending-self-spend');
    const initialHistoryRequired = this._initialHistoryRequired && !this._initialHistoryCompleted;
    const snapshot: WalletSnapshot = {
      network: defaultConfig.network,
      balance: emptyWallet
        ? { confirmed: sats(0), pending: sats(0), trustedPending: sats(0), total: sats(0) }
        : pendingSelfSpend
          ? {
              confirmed: sats(0),
              pending: sats(39_890),
              trustedPending: sats(39_890),
              total: sats(39_890)
            }
          : {
              confirmed: sats(Math.max(0, this._balance - this._pendingBalance)),
              pending: sats(Math.min(this._pendingBalance, this._balance)),
              trustedPending: sats(Math.min(this._pendingBalance, this._balance)),
              total: sats(this._balance)
            },
      transactions:
        emptyActivity || emptyWallet
          ? []
          : pendingSelfSpend
            ? [
                {
                  id: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
                  kind: 'self_spend',
                  direction: 'sent',
                  amount: 110,
                  fee: 110,
                  status: 'pending',
                  confirmations: 0,
                  date: 'Today, 20:36',
                  address: null,
                  label: 'Fee acceleration',
                  inputCount: 1,
                  outputCount: 1,
                  feeRate: 1,
                  walletInputAmount: 40_000,
                  walletOutputAmount: 39_890,
                  locktime: 0,
                  rbf: true,
                  intentLabel: null,
                  provenance: {
                    state: 'unknown',
                    context: 'funding',
                    labels: [],
                    clusterCount: 0,
                    addressReused: false
                  }
                }
              ]
            : structuredClone(this._transactions),
      utxos: emptyWallet ? [] : structuredClone(this._coins),
      receiveAddresses: structuredClone(this._addresses),
      labelSuggestions: structuredClone(this._labelSuggestionsByWallet.get(walletId) ?? []),
      syncedAt: initialHistoryRequired
        ? null
        : typeof location !== 'undefined' &&
            new URLSearchParams(location.search).has('fixture-stale-tip')
          ? '2026-01-01T00:00:00.000Z'
          : new Date().toISOString(),
      chainTip: {
        height: initialHistoryRequired ? 0 : 250_000,
        observedAt: initialHistoryRequired
          ? null
          : typeof location !== 'undefined' &&
              new URLSearchParams(location.search).has('fixture-stale-tip')
            ? '2026-01-01T00:00:00.000Z'
            : new Date().toISOString(),
        status: initialHistoryRequired
          ? 'unknown'
          : typeof location !== 'undefined' &&
              new URLSearchParams(location.search).has('fixture-stale-tip')
            ? 'stale'
            : 'recent'
      }
    };
    if (emptyActivity && !this._emptyActivitySyncScheduled) {
      this._emptyActivitySyncScheduled = true;
      setTimeout(() => {
        const selected = this._profiles.find((profile) => profile.id === walletId);
        for (const listener of this._listeners) {
          listener({
            type: 'wallet_updated',
            walletId,
            walletKind: selected?.kind ?? 'single_key',
            snapshot: structuredClone(snapshot)
          });
        }
      }, 50);
    }
    if (this._delayedWalletDataPending) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      this._delayedWalletDataPending = false;
    }
    if (this._delayedWalletSwitch && walletId === this._multisigProfileId) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    return snapshot;
  }

  async sync(_automatic = false): Promise<WalletSnapshot> {
    if (this._initialHistoryRequired && !this._initialHistoryCompleted)
      throw new WalletError(
        'initial_scan_required',
        'Complete the first wallet-history scan before syncing.'
      );
    return this.snapshot();
  }

  async cancelSync() {}

  async createAddress(rawLabels: string[]): Promise<ReceiveAddress> {
    const labels = rawLabels.map(normalizePermanentLabel);
    const label = labels[0];
    const id = Math.max(8, ...this._addresses.map((address) => address.id)) + 1;
    const address: ReceiveAddress = {
      id,
      address: `${addressPrefixForNetwork(defaultConfig.network)}qdummy${id.toString().padStart(4, '0')}5n8k2r7v4cx9s6jlawephgzuqf5t8ul`,
      label,
      labels,
      created: 'Just now',
      status: 'awaiting',
      derivationPath: `m/84'/1'/0'/0/${id}`
    };
    this._addresses = [address, ...this._addresses];
    labels.forEach((item) => this.recordLabelUsage(item, 'receive'));
    return structuredClone(address);
  }

  async discardAddress(id: number): Promise<void> {
    const address = this._addresses.find((item) => item.id === id);
    if (!address || !canDiscardAddress(address, false)) {
      throw new WalletError(
        'address_not_discardable',
        'Only an unused address awaiting payment can be discarded.'
      );
    }
    this._addresses = this._addresses.map((address) =>
      address.id === id ? { ...address, status: 'discarded' } : address
    );
  }

  async setCoinFrozen(outpoint: string, frozen: boolean) {
    const coin = this._coins.find((item) => item.outpoint === outpoint);
    if (!coin) throw new WalletError('internal_error', 'The selected coin is no longer available.');
    coin.frozen = frozen;
  }

  async setMultisigCoinFrozen(outpoint: string, frozen: boolean) {
    return this.setCoinFrozen(outpoint, frozen);
  }
  async previewCoinSelection(
    outpoints: string[],
    amount: ReturnType<typeof sats>
  ): Promise<CoinSelectionPreview> {
    const selected = this._coins.filter((coin) => outpoints.includes(coin.outpoint));
    const labels = [
      ...new Map(
        selected.flatMap((coin) => coin.provenance.labels).map((label) => [label.id, label])
      ).values()
    ];
    const clusters = Math.max(0, ...selected.map((coin) => coin.provenance.clusterCount));
    return {
      selectedAmount: sats(selected.reduce((total, coin) => total + coin.amount, 0)),
      selectedInputCount: selected.length,
      estimatedInputWeight: selected.length * 500,
      fundingLabels: labels,
      provenanceState: selected.some((coin) => coin.provenance.state === 'unknown')
        ? 'unknown'
        : labels.length > 1
          ? 'mixed'
          : 'known',
      existingClusterCount: clusters,
      newClusterLinks: Math.max(0, clusters - 1),
      hasUnknownProvenance: selected.some((coin) => coin.provenance.state === 'unknown'),
      hasAddressReuse: selected.some((coin) => coin.provenance.addressReused),
      oneExistingGroupCanFund: this._coins.some((coin) => !coin.frozen && coin.amount >= amount)
    };
  }
  previewMultisigCoinSelection(outpoints: string[], amount: ReturnType<typeof sats>) {
    return this.previewCoinSelection(outpoints, amount);
  }

  async estimateFees(): Promise<FeeEstimates> {
    if (this._feeEstimatesUnavailable) {
      throw new WalletError(
        'fee_estimate_unavailable',
        'Bitcoin Core has no usable fee estimate. Enter a custom fee rate.'
      );
    }
    return {
      economy: feeRate(3),
      standard: feeRate(7),
      priority: feeRate(12),
      source: 'Bitcoin Core'
    };
  }

  async maxSpend(
    _recipient: string,
    selectedRate: ReturnType<typeof feeRate>,
    coinSelection: CoinSelection = { mode: 'auto' }
  ) {
    const spendable = this._coins.filter(
      (coin) =>
        !coin.frozen &&
        (coinSelection.mode === 'auto' || coinSelection.outpoints.includes(coin.outpoint))
    );
    const available = spendable.reduce((total, coin) => total + coin.amount, 0);
    // Keep the fixture's authoritative drain fee distinct from the form's ordinary estimate so
    // browser acceptance catches callers that discard the native maximum-spend quote.
    const fee = sats(Math.ceil(Number(selectedRate) * 140));
    return { amount: sats(Math.max(0, available - fee)), fee };
  }

  async maxMultisigSpend(
    _recipient: string,
    selectedRate: ReturnType<typeof feeRate>,
    coinSelection: CoinSelection = { mode: 'auto' }
  ) {
    const spendable = this._coins.filter(
      (coin) =>
        !coin.frozen &&
        (coinSelection.mode === 'auto' || coinSelection.outpoints.includes(coin.outpoint))
    );
    const available = spendable.reduce((total, coin) => total + coin.amount, 0);
    const fee = sats(Math.ceil(Number(selectedRate) * 219));
    return { amount: sats(Math.max(0, available - fee)), fee };
  }

  async preparePayment(
    recipient: string,
    rawLabels: string[],
    amount: ReturnType<typeof sats>,
    selectedRate: ReturnType<typeof feeRate>,
    coinSelection: CoinSelection = { mode: 'auto' }
  ): Promise<PaymentProposal> {
    if (!hasAddressPrefixForNetwork(recipient, defaultConfig.network))
      throw new WalletError('invalid_address', 'Recipient must match the active Bitcoin network.');
    const labels = rawLabels.map(normalizePermanentLabel);
    const label = labels[0];
    const fee = sats(Math.ceil(Number(selectedRate) * 141));
    const spendable = this._coins.filter(
      (coin) =>
        !coin.frozen &&
        (coinSelection.mode === 'auto' || coinSelection.outpoints.includes(coin.outpoint))
    );
    const available = spendable.reduce((total, coin) => total + coin.amount, 0);
    if (Number(amount) + Number(fee) > available)
      throw new WalletError(
        'insufficient_funds',
        'Amount and fee exceed the selected, unfrozen balance.'
      );
    const selectedOutpoints =
      coinSelection.mode === 'manual' ? spendable.map((coin) => coin.outpoint) : [];
    const inputs = (selectedOutpoints.length ? selectedOutpoints : ['fixture-auto-input:0']).map(
      (outpoint) => ({ outpoint, amount: sats(available), sequence: 0xfffffffd })
    );
    const walletRecipient = this._addresses.find((address) => address.address === recipient);
    const proposal: PaymentProposal = {
      proposalId: crypto.randomUUID(),
      recipient,
      recipientTestnetAlias: null,
      recipientIsWalletOwned: Boolean(walletRecipient),
      walletControlledOutputAmount: walletRecipient ? amount : null,
      recipientDerivationPaths: walletRecipient?.derivationPath
        ? [walletRecipient.derivationPath]
        : [],
      label,
      labels,
      amount,
      fee,
      feeRate: selectedRate,
      total: sats(Number(amount) + Number(fee)),
      change: sats(0),
      changeAddresses: [],
      changeTestnetAliases: [],
      outputCount: 1,
      selectedOutpoints,
      inputs,
      locktime: 0,
      rbf: true,
      network: defaultConfig.network,
      selectionImpact: {
        strategy: coinSelection.mode === 'auto' ? (coinSelection.strategy ?? 'balanced') : 'manual',
        selectedInputCount: inputs.length,
        estimatedInputWeight: inputs.length * 500,
        fundingLabels: [],
        provenanceState: 'unknown',
        existingClusterCount: 0,
        newClusterLinks: 0,
        hasUnknownProvenance: true,
        hasAddressReuse: false,
        feeDifferenceVsPrivate:
          coinSelection.mode === 'auto' && coinSelection.strategy === 'lower_fee' ? -100 : null
      }
    };
    this._proposals.set(proposal.proposalId, proposal);
    labels.forEach((item) => this.recordLabelUsage(item, 'payment'));
    if (
      this._profiles.find((profile) => profile.id === this._selectedWalletId)?.kind === 'watch_only'
    ) {
      this._externalProposals.set(proposal.proposalId, {
        ...proposal,
        change: sats(0),
        changeAddresses: [],
        outputCount: 1,
        psbt: 'cHNidP8BAFICAAAA',
        signed: 0,
        required: 1,
        canFinalize: false,
        signedFingerprints: [],
        spendPath: 'primary',
        eligibleSignerFingerprints: [this._externalWallet?.signer.fingerprint ?? 'f00dbabe'],
        status: 'collecting',
        createdAt: new Date().toISOString()
      });
    }
    return proposal;
  }
  async paymentProposals() {
    return structuredClone([...this._proposals.values()]);
  }
  async cancelPaymentProposal(proposalId: string) {
    if (!this._proposals.delete(proposalId))
      throw new WalletError('proposal_not_found', 'The proposal is no longer active.');
  }
  async prepareAcceleration(
    txid: string,
    method: import('./contracts').AccelerationMethod,
    selectedRate: ReturnType<typeof feeRate>
  ) {
    const existing = [...this._accelerations].find(
      ([, acceleration]) => acceleration.originalTxid === txid && acceleration.method === method
    );
    if (existing) {
      const proposal = this._proposals.get(existing[0]);
      if (proposal) return structuredClone(proposal);
    }
    const tx = this._transactions.find((item) => item.id === txid);
    if (!tx || tx.status !== 'pending' || !tx.address) {
      throw new WalletError('internal_error', 'Only pending wallet payments can be accelerated.');
    }
    const proposal = await this.preparePayment(
      fixtureAddressForNetwork(tx.address),
      [tx.label],
      sats(Math.max(1, tx.amount)),
      selectedRate
    );
    this._accelerations.set(proposal.proposalId, { originalTxid: txid, method });
    if (method === 'rbf') {
      const quote = await this.quoteRbf(txid, selectedRate);
      proposal.fee = quote.estimatedReplacementFee;
      proposal.feeRate = quote.resultingEffectiveFeeRate;
      proposal.total = sats(Number(proposal.amount) + Number(proposal.fee));
      proposal.acceleration = {
        method,
        originalTxid: txid,
        originalFeeRate: quote.originalEffectiveFeeRate,
        minimumFeeRate: quote.minimumFeeRate,
        targetFeeRate: quote.targetFeeRate,
        incrementalFee: quote.incrementalFee,
        recommendationSource: quote.recommendationSource
      };
    } else {
      const quote = await this.quoteCpfp(txid, selectedRate);
      proposal.amount = sats(0);
      proposal.fee = quote.childFee;
      proposal.feeRate = quote.targetFeeRate;
      proposal.total = quote.childFee;
      proposal.acceleration = {
        method,
        originalTxid: txid,
        originalFeeRate: quote.parentEffectiveFeeRate,
        minimumFeeRate: quote.minimumFeeRate,
        targetFeeRate: quote.targetFeeRate,
        incrementalFee: quote.childFee,
        recommendationSource: quote.recommendationSource
      };
    }
    return proposal;
  }

  async quoteRbf(txid: string, selectedRate?: ReturnType<typeof feeRate>) {
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-acceleration-loading')
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-rbf-insufficient-funds')
    ) {
      throw new WalletError(
        'insufficient_funds',
        'Insufficient funds: the replacement fee cannot be funded.'
      );
    }
    const tx = this._transactions.find((item) => item.id === txid);
    if (!tx || tx.status !== 'pending' || tx.rbf !== true)
      throw new WalletError('transaction_not_replaceable', 'This transaction is not replaceable.');
    const originalRate = tx.feeRate ?? 1;
    const minimum = Math.ceil((originalRate + 1) * 250) / 250;
    const target = selectedRate ?? feeRate(Math.max(5, minimum + 1));
    if (target < minimum)
      throw new WalletError('fee_rate_too_low', `Choose at least ${minimum} sat/vB.`);
    const vsize = 152;
    const originalFee = sats(tx.fee ?? Math.ceil(originalRate * vsize));
    const replacementFee = sats(Math.ceil(Number(target) * vsize));
    return {
      method: 'rbf' as const,
      originalTxid: txid,
      originalFee,
      originalVsize: vsize,
      originalEffectiveFeeRate: feeRate(Math.round((originalFee / vsize) * 1000) / 1000),
      minimumFeeRate: feeRate(minimum),
      targetFeeRate: feeRate(Number(target)),
      estimatedReplacementFee: replacementFee,
      incrementalFee: sats(replacementFee - originalFee),
      resultingEffectiveFeeRate: feeRate(replacementFee / vsize),
      replacementVsize: vsize,
      recommendationSource: selectedRate ? ('custom' as const) : ('replacement_fallback' as const)
    };
  }

  async quoteCpfp(txid: string, selectedRate?: ReturnType<typeof feeRate>) {
    const tx = this._transactions.find((item) => item.id === txid);
    if (!tx || tx.status !== 'pending')
      throw new WalletError('acceleration_unavailable', 'Only pending transactions can use CPFP.');
    const parentVsize = 180;
    const parentFee = sats(tx.fee ?? Math.ceil(Number(tx.feeRate ?? 1) * parentVsize));
    const parentRate = Number(parentFee) / parentVsize;
    const minimum = Math.ceil((parentRate + 0.004) * 250) / 250;
    const target = selectedRate ?? feeRate(Math.max(5, minimum + 1));
    if (target < minimum)
      throw new WalletError(
        'fee_rate_too_low',
        `Choose at least ${minimum} sat/vB for this package.`
      );
    const childVsize = 110;
    const packageVsize = parentVsize + childVsize;
    const childFee = sats(
      Math.max(
        Math.ceil(Number(target) * packageVsize) - Number(parentFee),
        Math.ceil(Number(target) * childVsize)
      )
    );
    const packageFee = sats(Number(parentFee) + Number(childFee));
    return {
      method: 'cpfp' as const,
      originalTxid: txid,
      parentFee,
      parentVsize,
      parentEffectiveFeeRate: feeRate(Math.round(parentRate * 1000) / 1000),
      minimumFeeRate: feeRate(minimum),
      targetFeeRate: feeRate(Number(target)),
      childFee,
      childVsize,
      packageFee,
      packageVsize,
      resultingPackageFeeRate: feeRate(
        Math.round((Number(packageFee) / packageVsize) * 1000) / 1000
      ),
      recommendationSource: selectedRate ? ('custom' as const) : ('package_fallback' as const)
    };
  }

  async openTransactionExplorer(txid: string) {
    const url = transactionExplorerUrl(defaultConfig.network, txid);
    if (!url || typeof window === 'undefined' || !window.open(url, '_blank', 'noopener,noreferrer'))
      throw new WalletError(
        'internal_error',
        'The browser could not open the transaction explorer.'
      );
  }
  async exportLabels() {
    return {
      saved: true,
      recordCount: 6,
      revealToken: 'fixture-label-export-reveal',
      revealLabel: 'Show in Finder'
    };
  }
  async importLabels() {
    return { importedCount: 2, unchangedCount: 1, ignoredCount: 1, spendabilityChangeCount: 0 };
  }

  async signAndBroadcast(proposalId: string, credential: string) {
    const proposal = this._proposals.get(proposalId);
    if (!proposal)
      throw new WalletError('wallet_not_found', 'Payment proposal was not found or expired.');
    if (!this._selectedWalletId || credential !== this._credentials.get(this._selectedWalletId))
      throw new WalletError('invalid_credential', 'Incorrect passphrase / PIN.');
    const txid = this._accelerations.has(proposalId)
      ? '1b8cf4e8a09c7d12883143f9ab3fdf1d5f25a4784a96b35ec2e7a6c120437bad'
      : '0a7bf3d7a98d8bc981975320eba8e9b8ac1aa92145dcf018e48c3c2f8c19e2aa';
    this.#recordFixtureBroadcast(proposalId, proposal, txid);
    this._balance = Math.max(0, this._balance - Number(proposal.total));
    this.#emit({ type: 'transaction_broadcast', txid, balance: sats(this._balance) });
    this._proposals.delete(proposalId);
    return { txid, snapshot: await this.snapshot(), syncPending: false };
  }

  async listHardwareDevices() {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return [
      {
        id: 'virtual-coldcard',
        label: 'Virtual Coldcard',
        model: 'Coldcard simulator',
        fingerprint: 'f00dbabe',
        connected: true,
        status: 'ready' as const,
        message: 'Ready to import the public account key.',
        action: 'import' as const
      },
      {
        id: 'virtual-trezor-cosigner',
        label: 'Virtual Trezor signer',
        model: 'Trezor simulator',
        fingerprint: 'c0ffee01',
        connected: true,
        status: 'ready' as const,
        message: 'Ready to sign as a separate wallet signer.',
        action: 'import' as const
      },
      {
        id: 'virtual-ledger-outsider',
        label: 'Virtual Ledger outsider',
        model: 'Ledger simulator',
        fingerprint: '1ed9e001',
        connected: true,
        status: 'ready' as const,
        message: 'Connected, but not part of the demo wallet.',
        action: 'import' as const
      },
      this._trezorPinUnlocked
        ? {
            id: 'virtual-trezor',
            label: 'Virtual Trezor One',
            model: 'Trezor simulator',
            fingerprint: 'c0ffee03',
            connected: true,
            status: 'needs_passphrase' as const,
            message:
              'Unlocked. Choose the standard wallet with no passphrase, or select a hidden wallet on-device when supported.',
            action: 'confirm_empty_passphrase' as const
          }
        : {
            id: 'virtual-trezor',
            label: 'Virtual Trezor One',
            model: 'Trezor simulator',
            fingerprint: null,
            connected: true,
            status: 'needs_pin' as const,
            message:
              'Locked. Start the PIN matrix, then tap the blank cells matching the locations shown on the device.',
            action: 'prompt_pin' as const
          },
      {
        id: 'virtual-trezor-standard',
        label: 'Virtual Trezor Standard',
        model: 'Trezor simulator',
        fingerprint: 'c0ffee02',
        connected: true,
        status: 'needs_passphrase' as const,
        message:
          'Passphrase protection is enabled. Choose the standard wallet with no passphrase, or select a hidden wallet on-device when supported.',
        action: 'confirm_empty_passphrase' as const
      }
    ];
  }

  async listHardwareDevicesForTypes(deviceTypes: string[]) {
    const requested = new Set(deviceTypes.map((deviceType) => deviceType.trim().toLowerCase()));
    return (await this.listHardwareDevices()).filter((device) => {
      const identity = `${device.id} ${device.label} ${device.model}`.toLowerCase();
      return [...requested].some((deviceType) => identity.includes(deviceType));
    });
  }
  async findSavedHardwareDevice(signer: {
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
    const devices = await this.listHardwareDevicesForTypes([signer.deviceType]);
    const device = devices.find(
      (candidate) =>
        candidate.fingerprint?.toLowerCase() === signer.fingerprint.trim().toLowerCase()
    );
    if (!device)
      throw new WalletError('hardware_unavailable', 'The saved hardware signer was not found.');
    return device;
  }
  async promptHardwarePin(deviceId: string) {
    if (deviceId !== 'virtual-trezor' || this._trezorPinUnlocked)
      throw new WalletError(
        'invalid_hardware_request',
        'This device does not need the PIN-matrix flow.'
      );
    return 'fixture-pin-challenge';
  }
  async sendHardwarePin(challengeId: string, pinPositions: string) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (challengeId !== 'fixture-pin-challenge')
      throw new WalletError('hardware_challenge_expired', 'The PIN request expired.');
    if (!/^[1-9]{1,50}$/.test(pinPositions))
      throw new WalletError(
        'invalid_hardware_request',
        'Enter only PIN-matrix positions 1 through 9.'
      );
    this._trezorPinUnlocked = true;
  }
  async cancelHardwareOperations(_preserveMainnetAdmission = false) {}
  async checkHardwareCosigner(
    cosigner: PolicyDraft['cosigners'][number],
    deviceId: string,
    draft = false
  ) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const checkedAt = new Date().toISOString();
    const connected = await this.importHardwareCosigner(deviceId, cosigner.label, true);
    const identityMatches =
      connected.fingerprint.toLowerCase() === cosigner.fingerprint.toLowerCase() &&
      connected.derivationPath === cosigner.derivationPath &&
      connected.xpub === cosigner.xpub;
    if (!identityMatches)
      throw new WalletError(
        'unknown_signer',
        'The connected device does not hold this signer’s saved BIP48 account key.'
      );
    const result = {
      status: 'healthy' as const,
      checkedAt,
      summary: 'Signer matches this wallet.'
    };
    if (!draft) this.persistFixtureHardwareHealth(cosigner.fingerprint, result);
    return result;
  }
  async checkHardwareExternalSigner(signer: ExternalSigner, deviceId: string) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const connected = await this.importHardwareExternalSigner(deviceId, signer.label, true);
    const identityMatches =
      connected.fingerprint.toLowerCase() === signer.fingerprint.toLowerCase() &&
      connected.derivationPath === signer.derivationPath &&
      connected.xpub === signer.xpub;
    if (!identityMatches)
      throw new WalletError(
        'unknown_signer',
        'The connected device does not hold this signer’s saved BIP84 account key.'
      );
    const result = {
      status: 'healthy' as const,
      checkedAt: new Date().toISOString(),
      summary: 'Signer matches this wallet.'
    };
    this.persistFixtureHardwareHealth(signer.fingerprint, result);
    return result;
  }
  async hardwareHealthChecks() {
    const prefix = `${this._selectedWalletId ?? ''}:`;
    return [...this.hardwareHealthCheckRecords.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, record]) => structuredClone(record));
  }
  private persistFixtureHardwareHealth(signerFingerprint: string, check: CosignerHealthCheck) {
    if (!this._selectedWalletId)
      throw new WalletError('wallet_not_found', 'Select a wallet first.');
    const signerFingerprintNormalized = signerFingerprint.trim().toLowerCase();
    const record = { signerFingerprint: signerFingerprintNormalized, ...structuredClone(check) };
    this.hardwareHealthCheckRecords.set(
      `${this._selectedWalletId}:${signerFingerprintNormalized}`,
      record
    );
  }
  async multisigSignerPolicyVerifications() {
    if (
      typeof location !== 'undefined' &&
      location.search.includes('fixture-policy-status-offline')
    )
      throw new WalletError(
        'node_admission_required',
        'Verify this wallet’s Bitcoin Core connection.'
      );
    return structuredClone(this.multisigPolicyVerificationRecords);
  }
  async multisigPolicyVerificationAddress() {
    return {
      canonicalAddress: 'bcrt1qfixturepolicyaddress',
      testnetAlias: 'tb1qfixturepolicyaddress'
    };
  }
  async previewMultisigPolicyVerificationAddress(_policy: PolicyDraft) {
    return this.multisigPolicyVerificationAddress();
  }
  async verifyMultisigSignerPolicy(deviceId: string, signerFingerprint: string) {
    const device = (await this.listHardwareDevices()).find(
      (candidate) => candidate.id === deviceId
    );
    if (!device || device.fingerprint?.toLowerCase() !== signerFingerprint.toLowerCase()) {
      throw new WalletError(
        'unknown_signer',
        'The connected device does not match this wallet signer.'
      );
    }
    return {
      signerFingerprint: signerFingerprint.toLowerCase(),
      deviceType: device.model.toLowerCase(),
      verifiedAt: new Date().toISOString(),
      scope: 'policy_and_address' as const,
      displayedAddress: 'bcrt1qfixturepolicyaddress'
    };
  }
  async verifyMultisigDraftSignerPolicy(
    _policy: PolicyDraft,
    deviceId: string,
    signerFingerprint: string
  ) {
    return this.verifyMultisigSignerPolicy(deviceId, signerFingerprint);
  }
  async acknowledgeColdcardPolicy(signerFingerprint: string) {
    return {
      signerFingerprint: signerFingerprint.toLowerCase(),
      deviceType: 'coldcard',
      verifiedAt: new Date().toISOString(),
      scope: 'policy_file_acknowledgement' as const,
      displayedAddress: null
    };
  }
  async importHardwareCosigner(deviceId: string, label: string, allowEmptyPassphrase = false) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const trezor = deviceId === 'virtual-trezor-standard' || deviceId === 'virtual-trezor';
    if (trezor && !allowEmptyPassphrase)
      throw new WalletError(
        'hardware_wallet_selection_required',
        'Choose whether this signer uses the standard wallet with no passphrase.'
      );
    if (deviceId === 'virtual-trezor' && !this._trezorPinUnlocked)
      throw new WalletError(
        'hardware_unavailable',
        'Unlock this Trezor before selecting its wallet.'
      );
    if (!['virtual-coldcard', 'virtual-trezor-standard', 'virtual-trezor'].includes(deviceId))
      throw new WalletError('hardware_unavailable', 'The selected device is no longer connected.');
    const trezorFingerprint = deviceId === 'virtual-trezor' ? 'c0ffee03' : 'c0ffee02';
    return {
      id: deviceId,
      label,
      fingerprint: trezor ? trezorFingerprint : 'f00dbabe',
      xpub: trezor
        ? 'tpubD6NzVbkrYhZ4Y-virtual-trezor-standard-public-key'
        : 'tpubD6NzVbkrYhZ4Y-fixture-coldcard-public-key',
      derivationPath: MULTISIG_ACCOUNT_PATH,
      source: 'virtual' as const,
      deviceType: trezor ? 'trezor' : 'coldcard'
    };
  }
  async parseExternalSignerImport(
    encoded: string,
    label: string,
    source: ExternalSignerSource
  ): Promise<ExternalSigner> {
    if (/xprv|tprv|seed|mnemonic/i.test(encoded))
      throw new WalletError(
        'private_material_rejected',
        'Private material must stay on the signer.'
      );
    const parsed = encoded.trim().startsWith('{') ? JSON.parse(encoded) : null;
    const fingerprint = parsed?.fingerprint ?? parsed?.xfp ?? 'f00dbabe';
    const xpub =
      parsed?.xpub ?? parsed?.bip84?.xpub ?? 'tpubD6NzVbkrYhZ4Y-fixture-external-public-key';
    const derivationPath =
      parsed?.derivationPath ?? parsed?.deriv ?? parsed?.bip84?.deriv ?? "m/84'/1'/0'";
    if (derivationPath.replaceAll('h', "'") !== "m/84'/1'/0'")
      throw new WalletError('invalid_derivation_path', "Use m/84'/1'/0'.");
    return {
      label: label.trim(),
      fingerprint: fingerprint.toLowerCase(),
      xpub,
      derivationPath: "m/84'/1'/0'",
      source,
      deviceType: null
    };
  }
  async importHardwareExternalSigner(
    deviceId: string,
    label: string,
    allowEmptyPassphrase = false
  ): Promise<ExternalSigner> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const trezor = deviceId === 'virtual-trezor-standard' || deviceId === 'virtual-trezor';
    if (trezor && !allowEmptyPassphrase)
      throw new WalletError(
        'hardware_wallet_selection_required',
        'Choose whether this signer uses the standard wallet with no passphrase.'
      );
    if (deviceId === 'virtual-trezor' && !this._trezorPinUnlocked)
      throw new WalletError(
        'hardware_unavailable',
        'Unlock this Trezor before selecting its wallet.'
      );
    const trezorFingerprint = deviceId === 'virtual-trezor' ? 'c0ffee03' : 'c0ffee02';
    return {
      label: label.trim(),
      fingerprint: trezor ? trezorFingerprint : 'f00dbabe',
      xpub: trezor
        ? 'tpubD6NzVbkrYhZ4Y-fixture-trezor-standard-public-key'
        : 'tpubD6NzVbkrYhZ4Y-fixture-external-public-key',
      derivationPath: "m/84'/1'/0'",
      source: 'usb',
      deviceType: trezor ? 'trezor' : 'coldcard'
    };
  }
  async createExternalSignerWallet(
    name: string,
    signer: ExternalSigner,
    credential: string
  ): Promise<ExternalSignerWallet> {
    const profile: WalletProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      network: defaultConfig.network,
      kind: 'watch_only',
      descriptorChecksum: 'extkey01',
      createdAt: Date.now(),
      backupVerified: true
    };
    this._profiles.push(profile);
    this._selectedWalletId = profile.id;
    this._credentials.set(profile.id, credential);
    this._unlockedWalletIds.add(profile.id);
    this._exists = true;
    this._externalWallet = {
      version: 1,
      name: profile.name,
      signer: { ...signer },
      externalDescriptor: `wpkh([${signer.fingerprint}/84'/1'/0']${signer.xpub}/0/*)#fixture1`,
      internalDescriptor: `wpkh([${signer.fingerprint}/84'/1'/0']${signer.xpub}/1/*)#fixture2`
    };
    return structuredClone(this._externalWallet);
  }
  async externalSignerWallet() {
    if (
      !this._externalWallet ||
      this._profiles.find((profile) => profile.id === this._selectedWalletId)?.kind !== 'watch_only'
    )
      throw new WalletError('wallet_not_found', 'No external-signer wallet exists.');
    return structuredClone(this._externalWallet);
  }
  async renameExternalSigner(label: string) {
    if (!this._selectedWalletId || !this._unlockedWalletIds.has(this._selectedWalletId)) {
      throw new WalletError(
        'wallet_locked',
        'Unlock this wallet before renaming its hardware signer.'
      );
    }
    if (
      !this._externalWallet ||
      this._profiles.find((profile) => profile.id === this._selectedWalletId)?.kind !== 'watch_only'
    ) {
      throw new WalletError('wallet_not_found', 'No external-signer wallet exists.');
    }
    const normalized = label.trim().replace(/\s+/g, ' ');
    if (!normalized || [...normalized].length > 48) {
      throw new WalletError(
        'invalid_label',
        'Hardware signer names must contain 1 to 48 characters.'
      );
    }
    this._externalWallet.signer.label = normalized;
    return structuredClone(this._externalWallet);
  }
  async exportExternalSignerDescriptor(credential: string) {
    if (!this._selectedWalletId || credential !== this._credentials.get(this._selectedWalletId))
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (!this._externalWallet)
      throw new WalletError('wallet_not_found', 'No external-signer wallet exists.');
    const descriptor = this._externalWallet.externalDescriptor;
    return {
      descriptor,
      content: JSON.stringify({ version: 1, network: defaultConfig.network, descriptor }, null, 2)
    };
  }
  async externalSignerProposals() {
    return structuredClone([...this._externalProposals.values()]);
  }
  async importExternalSignerProposal(proposalId: string, reviewedPsbt: string, signedPsbt: string) {
    const proposal = this._externalProposals.get(proposalId);
    if (!proposal) throw new WalletError('proposal_not_found', 'Proposal not found.');
    if (proposal.psbt !== reviewedPsbt)
      throw new WalletError('proposal_mismatch', 'The proposal changed after review.');
    if (signedPsbt === 'fixture-rejected-psbt')
      throw new WalletError(
        'proposal_mismatch',
        'The PSBT does not match the transaction you reviewed. No signatures were changed.'
      );
    proposal.signed = 1;
    proposal.canFinalize = true;
    proposal.status = 'ready';
    proposal.signedFingerprints = [this._externalWallet?.signer.fingerprint ?? 'f00dbabe'];
    return structuredClone(proposal);
  }
  async signExternalWithHardware(proposalId: string, _deviceId: string, reviewedPsbt: string) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return this.importExternalSignerProposal(proposalId, reviewedPsbt, reviewedPsbt);
  }
  async discardExternalSignerSignature(proposalId: string, reviewedPsbt: string) {
    const proposal = this._externalProposals.get(proposalId);
    if (!proposal) throw new WalletError('proposal_not_found', 'Proposal not found.');
    if (proposal.psbt !== reviewedPsbt)
      throw new WalletError(
        'proposal_mismatch',
        'The proposal changed after review. Reload it before discarding the signature.'
      );
    if (!proposal.canFinalize || proposal.signed !== 1)
      throw new WalletError(
        'signature_not_found',
        'The hardware signer has no complete signature in this proposal.'
      );
    proposal.signed = 0;
    proposal.canFinalize = false;
    proposal.status = 'collecting';
    proposal.signedFingerprints = [];
    proposal.psbt = `${proposal.psbt}:discarded-external-signature`;
    return structuredClone(proposal);
  }
  async broadcastExternalSignerProposal(
    proposalId: string,
    reviewedPsbt: string,
    credential: string
  ) {
    if (!this._selectedWalletId || credential !== this._credentials.get(this._selectedWalletId))
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    const proposal = this._externalProposals.get(proposalId);
    if (!proposal?.canFinalize) throw new WalletError('insufficient_signatures', 'Sign first.');
    if (proposal.psbt !== reviewedPsbt)
      throw new WalletError('proposal_mismatch', 'The signed proposal changed after review.');
    this._externalProposals.delete(proposalId);
    return {
      txid: '0a7bf3d7a98d8bc981975320eba8e9b8ac1aa92145dcf018e48c3c2f8c19e2aa',
      snapshot: await this.snapshot(),
      syncPending: false
    };
  }
  async cancelExternalSignerProposal(proposalId: string) {
    this._externalProposals.delete(proposalId);
  }
  async verifyExternalAddress(deviceId: string, addressId: number) {
    const rejectReview =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem('fixture-hardware-review-rejected') === '1';
    await new Promise((resolve) => setTimeout(resolve, rejectReview ? 800 : 250));
    if (rejectReview)
      throw new WalletError('hardware_cancelled', 'The address review was rejected on-device.');
    const expected = this._externalWallet?.signer.fingerprint.toLowerCase();
    const device = (await this.listHardwareDevices()).find(
      (item) => item.id === deviceId && item.status === 'ready'
    );
    if (!device)
      throw new WalletError('hardware_unavailable', 'Connect and unlock the expected signer.');
    if (!expected || device.fingerprint?.toLowerCase() !== expected)
      throw new WalletError(
        'unknown_signer',
        'The connected device does not match any saved signer for this wallet.'
      );
    const address = this._addresses.find((item) => item.id === addressId);
    if (!address) throw new WalletError('address_not_found', 'The receive address was not found.');
    const verified = {
      ...address,
      hardwareVerifiedAt: new Date().toISOString(),
      hardwareVerifiedBy: device.fingerprint
    };
    this._addresses = this._addresses.map((item) => (item.id === addressId ? verified : item));
    return structuredClone(verified);
  }

  async previewMultisig(policy: PolicyDraft): Promise<MultisigPreview> {
    const errors = validatePolicyDraft(policy);
    if (errors.length) throw new WalletError('invalid_descriptor', errors[0]);
    const cosigners = policy.cosigners.map(normalizeCosigner);
    return {
      name: policy.name.trim(),
      threshold: policy.threshold,
      cosigners,
      externalDescriptor: descriptorPreview(policy.threshold, cosigners, 0),
      internalDescriptor: descriptorPreview(policy.threshold, cosigners, 1)
    };
  }

  async analyzeRecoveryPolicy(
    template: RecoveryTemplate,
    cosigners: PolicyDraft['cosigners']
  ): Promise<RecoveryPolicyAnalysis> {
    const paths =
      template.type === 'recovery'
        ? [{ ...template.immediate, availableAfterBlocks: 0 }, template.recovery]
        : template.stages;
    if (
      paths.length < 2 ||
      paths.some((path) => path.threshold < 1 || path.threshold > path.signerIds.length)
    ) {
      throw new WalletError('unsafe_threshold', 'Every spending path needs a reachable threshold.');
    }
    const known = new Set(cosigners.map((key) => key.id));
    if (paths.some((path) => path.signerIds.some((id) => !known.has(id))))
      throw new WalletError('unknown_signer', 'A spending path contains an unknown signer.');
    if (
      template.type === 'recovery' &&
      template.recovery.signerIds.some((id) => template.immediate.signerIds.includes(id))
    )
      throw new WalletError(
        'recovery_signer_reused',
        'The recovery signer must be independent from every immediate-path signer.'
      );
    if (
      paths
        .slice(1)
        .some((path, index) => path.availableAfterBlocks <= paths[index].availableAfterBlocks)
    )
      throw new WalletError('invalid_timeline', 'Recovery delays must increase.');
    return {
      externalDescriptor: `wsh(${template.type}-policy/0/*)#prototype`,
      internalDescriptor: `wsh(${template.type}-policy/1/*)#prototype`,
      paths,
      warnings:
        template.type === 'decaying'
          ? [
              {
                code: 'reduced_theft_resistance',
                message:
                  'Later paths require fewer signatures and intentionally reduce theft resistance.'
              }
            ]
          : [],
      maxSatisfactionWeight: 420
    };
  }

  async createMultisig(
    policy: PolicyDraft,
    credential: string,
    _networkSetupSourceWalletId?: string
  ): Promise<import('./contracts').MultisigCreation> {
    if (!credential) throw new WalletError('invalid_credential', 'An app PIN is required.');
    const preview = await this.previewMultisig(policy);
    if (
      this._multisigProfileId &&
      this._multisig?.externalDescriptor === preview.externalDescriptor
    )
      throw new WalletError(
        'wallet_already_exists',
        'This exact descriptor wallet already exists on this device.',
        this._multisigProfileId
      );
    const setupDraft = this.multisigSetupDraftValue;
    this._recoveryVerified = false;
    this._multisig = {
      ...preview,
      kind: 'multisig',
      createdAt: new Date().toISOString(),
      policyType: 'standard'
    };
    this._multisigCredential = credential;
    if (this._multisigProfileId) {
      this._profiles = this._profiles.filter((wallet) => wallet.id !== this._multisigProfileId);
      this._credentials.delete(this._multisigProfileId);
      this._unlockedWalletIds.delete(this._multisigProfileId);
    }
    const profile = {
      id: crypto.randomUUID(),
      name: this._multisig.name,
      network: defaultConfig.network,
      kind: 'multisig' as const,
      descriptorChecksum: 'multisig',
      createdAt: Date.now(),
      backupVerified: true
    };
    this._profiles.push(profile);
    this._multisigProfileId = profile.id;
    this._selectedWalletId = profile.id;
    this._credentials.set(profile.id, credential);
    this._unlockedWalletIds.add(profile.id);
    this._exists = true;
    this.multisigPolicyVerificationRecords = [
      ...(setupDraft?.policyVerifications.map((verification) => ({
        signerFingerprint: verification.signerFingerprint.toLowerCase(),
        deviceType: verification.deviceType,
        verifiedAt: verification.verifiedAt,
        scope: 'policy_and_address' as const,
        displayedAddress: verification.displayedAddress
      })) ?? []),
      ...(setupDraft?.coldcardRegistered
        ? preview.cosigners
            .filter((signer) => policyReadinessKind(signer) === 'coldcard')
            .map((signer) => ({
              signerFingerprint: signer.fingerprint.toLowerCase(),
              deviceType: 'coldcard',
              verifiedAt: new Date().toISOString(),
              scope: 'policy_file_acknowledgement' as const,
              displayedAddress: null
            }))
        : [])
    ];
    this.multisigSetupDraftValue = null;
    return { wallet: structuredClone(this._multisig), networkSetupCopied: true };
  }

  async createRecoveryMultisig(
    name: string,
    template: RecoveryTemplate,
    cosigners: PolicyDraft['cosigners'],
    credential: string,
    _networkSetupSourceWalletId?: string
  ): Promise<import('./contracts').MultisigCreation> {
    if (!credential) throw new WalletError('invalid_credential', 'An app PIN is required.');
    const analysis = await this.analyzeRecoveryPolicy(template, cosigners);
    this._recoveryVerified = false;
    this._multisig = {
      kind: 'multisig',
      name: name.trim(),
      threshold: analysis.paths[0].threshold,
      cosigners,
      externalDescriptor: analysis.externalDescriptor,
      internalDescriptor: analysis.internalDescriptor,
      createdAt: new Date().toISOString(),
      policyType: 'recovery',
      recoveryTemplate: template,
      spendingPaths: analysis.paths
    };
    this._multisigCredential = credential;
    if (this._multisigProfileId) {
      this._profiles = this._profiles.filter((wallet) => wallet.id !== this._multisigProfileId);
      this._credentials.delete(this._multisigProfileId);
      this._unlockedWalletIds.delete(this._multisigProfileId);
    }
    const profile = {
      id: crypto.randomUUID(),
      name: this._multisig.name,
      network: defaultConfig.network,
      kind: 'multisig' as const,
      descriptorChecksum: 'recovery',
      createdAt: Date.now(),
      backupVerified: true
    };
    this._profiles.push(profile);
    this._multisigProfileId = profile.id;
    this._selectedWalletId = profile.id;
    this._credentials.set(profile.id, credential);
    this._unlockedWalletIds.add(profile.id);
    this._exists = true;
    this.multisigSetupDraftValue = null;
    return { wallet: structuredClone(this._multisig), networkSetupCopied: true };
  }

  async multisigWallet() {
    return this._multisig ? structuredClone(this._multisig) : null;
  }
  async renameMultisigSigner(signerId: string, label: string) {
    if (
      !this._multisig ||
      !this._selectedWalletId ||
      !this._unlockedWalletIds.has(this._selectedWalletId)
    ) {
      throw new WalletError('wallet_locked', 'Unlock this wallet before renaming a signer.');
    }
    const normalized = normalizeSignerLabel(label);
    if (!normalized || Array.from(normalized).length > 48) {
      throw new WalletError('invalid_label', 'Signer names must contain 1 to 48 characters.');
    }
    const signer = this._multisig.cosigners.find((candidate) => candidate.id === signerId);
    if (!signer) throw new WalletError('unknown_signer', 'This signer is not part of the wallet.');
    signer.label = normalized;
    return structuredClone(this._multisig);
  }
  async exportMultisig(credential: string) {
    if (!this._multisig) throw new WalletError('wallet_not_found', 'No multisig wallet exists.');
    if (credential !== this._multisigCredential)
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    return JSON.stringify(
      { version: 1, network: defaultConfig.network, wallet: this._multisig },
      null,
      2
    );
  }
  async exportMultisigBsms(credential: string) {
    if (!this._multisig) throw new WalletError('wallet_not_found', 'No multisig wallet exists.');
    if (credential !== this._multisigCredential)
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    const template = this._multisig.externalDescriptor.split('#')[0].replaceAll('/0/*', '/**');
    return `BSMS 1.0\n${template}\n/0/*,/1/*\n${addressPrefixForNetwork(defaultConfig.network)}qdummy5n8k2r7v4cx9s6jlawephgzuqf5t8ul\n`;
  }
  async savePublicBackup(suggestedFilename: string, content: string) {
    const { downloadText } = await import('$lib/transfer');
    downloadText(suggestedFilename, content);
    return {
      saved: true,
      revealToken: '00000000-0000-4000-8000-000000000001',
      revealLabel: 'Show in Finder'
    };
  }
  async preparePublicBackupPdf(_suggestedFilename: string) {
    window.print();
    return { prepared: false, saveToken: null };
  }
  async savePublicBackupPdf(_saveToken: string, _markup: string) {
    return { saved: false, revealToken: null, revealLabel: null };
  }
  async inspectMultisigBsms(encodedBackup: string) {
    const lines = encodedBackup.trimEnd().split('\n');
    const isBsms = lines.length === 4 && lines[0] === 'BSMS 1.0' && lines[2] === '/0/*,/1/*';
    const publicDescriptor = lines.find((line) => line.trim().startsWith('wsh('));
    if (!isBsms && !publicDescriptor)
      throw new WalletError(
        'invalid_backup',
        'Enter a valid BSMS, Groot JSON, or public descriptor backup.'
      );
    const currentTemplate = this._multisig?.externalDescriptor
      .split('#')[0]
      .replaceAll('/0/*', '/**');
    const importedTemplate = isBsms
      ? lines[1]
      : publicDescriptor!
          .trim()
          .split('#')[0]
          .replaceAll('/<0;1>/*', '/**')
          .replaceAll('/0/*', '/**');
    const matchesCurrentWallet = currentTemplate === importedTemplate;
    this._recoveryVerified = matchesCurrentWallet;
    return {
      firstAddress: isBsms
        ? lines[3]
        : `${addressPrefixForNetwork(defaultConfig.network)}qdummy5n8k2r7v4cx9s6jlawephgzuqf5t8ul`,
      matchesCurrentWallet
    };
  }
  async recoverMultisigBsms(name: string, encodedBackup: string, credential: string) {
    await this.inspectMultisigBsms(encodedBackup);
    if (!name.trim()) throw new WalletError('invalid_wallet_name', 'Enter a wallet name.');
    if (!credential) throw new WalletError('invalid_credential', 'An app PIN is required.');
    const recovered = fixtureMultisigWallet();
    recovered.name = name.trim();
    recovered.createdAt = new Date().toISOString();
    this._multisig = recovered;
    this._multisigCredential = credential;
    const profile = {
      id: crypto.randomUUID(),
      name: recovered.name,
      network: defaultConfig.network,
      kind: 'multisig' as const,
      descriptorChecksum: 'bsms-restored',
      createdAt: Date.now(),
      backupVerified: true
    };
    this._profiles.push(profile);
    this._multisigProfileId = profile.id;
    this._selectedWalletId = profile.id;
    this._credentials.set(profile.id, credential);
    this._exists = true;
    return structuredClone(recovered);
  }
  async recoveryDrill(encodedBackup: string) {
    try {
      const parsed = JSON.parse(encodedBackup);
      const matchesCurrentWallet =
        parsed?.wallet?.externalDescriptor === this._multisig?.externalDescriptor;
      this._recoveryVerified = matchesCurrentWallet;
      return {
        firstAddress: `${addressPrefixForNetwork(defaultConfig.network)}qdummy5n8k2r7v4cx9s6jlawephgzuqf5t8ul`,
        matchesCurrentWallet
      };
    } catch {
      throw new WalletError('invalid_backup', 'Enter a valid Groot descriptor backup.');
    }
  }
  async multisigRecoveryDrillStatus() {
    return this._recoveryVerified;
  }
  async recoverMultisig(encodedBackup: string, credential: string) {
    if (this._multisig)
      throw new WalletError(
        'wallet_already_exists',
        'Delete the current multisig wallet before recovering another one.'
      );
    try {
      const parsed = JSON.parse(encodedBackup);
      if (parsed?.version !== 1 || parsed?.network !== defaultConfig.network || !parsed.wallet)
        throw new Error();
      this._recoveryVerified = false;
      this._multisig = parsed.wallet;
      this._multisigCredential = credential;
      const profile = {
        id: crypto.randomUUID(),
        name: this._multisig!.name,
        network: defaultConfig.network,
        kind: 'multisig' as const,
        descriptorChecksum: 'restored',
        createdAt: Date.now(),
        backupVerified: true
      };
      this._profiles.push(profile);
      this._multisigProfileId = profile.id;
      this._selectedWalletId = profile.id;
      this._credentials.set(profile.id, credential);
      this._unlockedWalletIds.add(profile.id);
      this._exists = true;
      return structuredClone(this._multisig!);
    } catch {
      throw new WalletError('invalid_backup', 'Enter a valid Groot descriptor backup.');
    }
  }
  async deleteMultisig(credential: string, confirmation: string) {
    if (!this._multisig) throw new WalletError('wallet_not_found', 'No multisig wallet exists.');
    if (!this._recoveryVerified)
      throw new WalletError(
        'backup_mismatch',
        'Complete a successful recovery test before deleting this wallet.'
      );
    if (confirmation !== this._multisig.name)
      throw new WalletError(
        'confirmation_mismatch',
        'Type the exact wallet name to delete this coordinator.'
      );
    if (credential !== this._multisigCredential)
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (this._multisigProfileId) {
      this._profiles = this._profiles.filter((wallet) => wallet.id !== this._multisigProfileId);
      this._credentials.delete(this._multisigProfileId);
      this._unlockedWalletIds.delete(this._multisigProfileId);
    }
    this._selectedWalletId = this._profiles[0]?.id ?? null;
    this._exists = this._profiles.length > 0;
    this._multisig = null;
    this._multisigCredential = '';
    this._multisigProfileId = null;
    this._multisigProposals.clear();
    this._recoveryVerified = false;
  }
  async multisigSnapshot() {
    if (
      typeof location !== 'undefined' &&
      location.search.includes('fixture-policy-status-offline')
    )
      throw new WalletError(
        'node_admission_required',
        'Verify this wallet’s Bitcoin Core connection.'
      );
    return this.snapshot();
  }
  async overview(walletId: string): Promise<import('./contracts').WalletOverview> {
    if (walletId !== this._selectedWalletId)
      throw new WalletError('wallet_selection_changed', 'The selected wallet changed.');
    const snapshot = await this.snapshot();
    return {
      network: snapshot.network,
      balance: snapshot.balance,
      utxos: snapshot.utxos,
      transactions: sortTransactions(snapshot.transactions, 'newest').slice(0, 3),
      syncedAt: snapshot.syncedAt,
      chainTip: snapshot.chainTip,
      pendingOutgoing: pendingBalanceBreakdown(snapshot).outgoing
    };
  }
  async activity(
    request: import('./contracts').ActivityRequest
  ): Promise<import('./contracts').ActivityPage> {
    if (request.walletId !== this._selectedWalletId)
      throw new WalletError('wallet_selection_changed', 'The selected wallet changed.');
    if (
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100 ||
      [...request.query].length > 128
    )
      throw new WalletError('invalid_transaction', 'The history request is invalid.');
    const snapshot = await this.snapshot();
    const query = request.query.trim().toLowerCase();
    if (typeof location !== 'undefined') {
      const params = new URLSearchParams(location.search);
      if (params.has('fixture-large-history') && snapshot.transactions[0]) {
        snapshot.transactions = Array.from({ length: 120 }, (_, index) => ({
          ...snapshot.transactions[0],
          id: index.toString(16).padStart(64, '0'),
          label: `Synthetic history ${index}`,
          intentLabel: null,
          provenance: { ...snapshot.transactions[0].provenance, labels: [] },
          direction: index % 2 ? 'sent' : 'received',
          status: 'confirmed',
          confirmations: 1,
          amount: sats(index + 1),
          date: '2026-09-01T00:00:00.000Z'
        }));
      }
      if (
        params.has('fixture-history-page-error') &&
        request.cursor &&
        !this.activityFixtureFailed
      ) {
        this.activityFixtureFailed = true;
        throw new WalletError('internal_error', 'Synthetic history page failure.');
      }
    }
    const transactions = sortTransactions(
      snapshot.transactions
        .filter(
          (tx) =>
            (request.filter === 'all' || request.filter === tx.direction) &&
            [
              tx.label,
              tx.intentLabel?.text,
              ...tx.provenance.labels.map((label) => label.text)
            ].some((label) => label?.toLowerCase().includes(query))
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
      request.sort
    );
    const encoded = new TextEncoder().encode(
      JSON.stringify([request.walletId, request.filter, query, request.sort, transactions])
    );
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const revision = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    const index = request.cursor
      ? transactions.findIndex((tx) => tx.id === request.cursor?.after)
      : -1;
    if (request.cursor && (request.cursor.revision !== revision || index < 0))
      throw new WalletError('history_changed', 'History changed. Refresh the transaction list.');
    const page = transactions.slice(index + 1, index + 1 + request.limit);
    return {
      transactions: page,
      total: transactions.length,
      nextCursor:
        index + 1 + page.length < transactions.length
          ? { revision, after: page[page.length - 1].id }
          : null
    };
  }
  async syncMultisig(_automatic = false) {
    return this.snapshot();
  }
  async createMultisigAddress(labels: string[]) {
    return this.createAddress(labels);
  }
  async claimObservedMultisigAddress(outpoint: string, rawLabel: string) {
    const label = normalizePermanentLabel(rawLabel);
    const coin = this._coins.find((item) => item.outpoint === outpoint);
    if (!coin || coin.provenance.context !== 'received' || coin.primaryLabel) {
      throw new WalletError(
        'address_not_found',
        'The selected coin is not an unlabeled received output.'
      );
    }
    const labelEntity = this.recordLabelUsage(label, 'receive');
    const permanentLabel = {
      id: labelEntity?.id ?? `receive-observed-${Date.now()}`,
      text: labelEntity?.text ?? label,
      origin: 'receive' as const
    };
    coin.label = label;
    coin.primaryLabel = permanentLabel;
    coin.provenance = {
      ...coin.provenance,
      state: 'known',
      labels: [permanentLabel]
    };
    const id = Math.max(-1, ...this._addresses.map((address) => address.id)) + 1;
    const address: ReceiveAddress = {
      id,
      address: coin.address,
      label,
      created: 'Just now',
      status: 'used',
      derivationPath: `${MULTISIG_ACCOUNT_PATH}/0/${id}`
    };
    this._addresses = [address, ...this._addresses];
    return structuredClone(address);
  }
  async discardMultisigAddress(id: number) {
    return this.discardAddress(id);
  }
  async encodePsbtUr(psbt: string, fragmentBytes = 180) {
    const payload = btoa(psbt);
    const chunks = Array.from({ length: Math.ceil(payload.length / fragmentBytes) }, (_, index) =>
      payload.slice(index * fragmentBytes, (index + 1) * fragmentBytes)
    );
    if (chunks.length === 1) return [`ur:crypto-psbt/${chunks[0]}`];
    return chunks.map((chunk, index) => `ur:crypto-psbt/${index + 1}of${chunks.length}/${chunk}`);
  }
  async decodePsbtUr(frames: string[]) {
    if (!frames.length)
      throw new WalletError('internal_error', 'Scan at least one crypto-psbt frame.');
    const multipart = frames.map((frame) => {
      const parts = frame.split('/');
      const sequence = /^(\d+)of(\d+)$/.exec(parts.at(-2) ?? '');
      return sequence
        ? { index: Number(sequence[1]), total: Number(sequence[2]), payload: parts.at(-1) ?? '' }
        : null;
    });
    if (multipart.every((part) => part === null)) return atob(frames[0].split('/').at(-1) ?? '');
    const parts = multipart.filter((part): part is NonNullable<typeof part> => part !== null);
    const total = parts[0]?.total ?? 0;
    if (parts.length < total)
      throw new WalletError(
        'internal_error',
        `Keep scanning (${parts.length} of ${total} frames).`
      );
    return atob(
      parts
        .sort((a, b) => a.index - b.index)
        .map((part) => part.payload)
        .join('')
    );
  }
  async prepareMultisigPayment(
    recipient: string,
    rawLabels: string[],
    amount: ReturnType<typeof sats>,
    selectedRate: ReturnType<typeof feeRate>,
    coinSelection: CoinSelection = { mode: 'auto' }
  ) {
    if (!this._multisig)
      throw new WalletError('wallet_not_found', 'Create a multisig wallet first.');
    if (!hasAddressPrefixForNetwork(recipient, defaultConfig.network))
      throw new WalletError('invalid_address', 'Recipient must match the active Bitcoin network.');
    const labels = rawLabels.map(normalizePermanentLabel);
    const label = labels[0];
    const fee = sats(Math.ceil(Number(selectedRate) * 220));
    const spendable = this._coins.filter(
      (coin) =>
        !coin.frozen &&
        (coinSelection.mode === 'auto' || coinSelection.outpoints.includes(coin.outpoint))
    );
    const available = spendable.reduce((total, coin) => total + coin.amount, 0);
    if (Number(amount) + Number(fee) > available)
      throw new WalletError(
        'insufficient_funds',
        'Amount and fee exceed the selected, unfrozen balance.'
      );
    const selectedOutpoints =
      coinSelection.mode === 'manual' ? spendable.map((coin) => coin.outpoint) : [];
    const inputs = (selectedOutpoints.length ? selectedOutpoints : ['fixture-auto-input:0']).map(
      (outpoint) => ({ outpoint, amount: sats(available), sequence: 0xfffffffd })
    );
    const walletRecipient = this._addresses.find((address) => address.address === recipient);
    const proposal: MultisigProposal = {
      proposalId: crypto.randomUUID(),
      recipient,
      labels,
      recipientTestnetAlias: null,
      recipientIsWalletOwned: Boolean(walletRecipient),
      walletControlledOutputAmount: walletRecipient ? amount : null,
      recipientDerivationPaths: walletRecipient?.derivationPath
        ? [walletRecipient.derivationPath]
        : [],
      label,
      amount,
      fee,
      feeRate: selectedRate,
      total: sats(Number(amount) + Number(fee)),
      selectedOutpoints,
      inputs,
      locktime: 0,
      rbf: true,
      network: defaultConfig.network,
      change: sats(0),
      changeAddresses: [],
      changeTestnetAliases: [],
      outputCount: 1,
      selectionImpact: {
        strategy: coinSelection.mode === 'auto' ? (coinSelection.strategy ?? 'balanced') : 'manual',
        selectedInputCount: inputs.length,
        estimatedInputWeight: inputs.length * 500,
        fundingLabels: [],
        provenanceState: 'unknown',
        existingClusterCount: 0,
        newClusterLinks: 0,
        hasUnknownProvenance: true,
        hasAddressReuse: false,
        feeDifferenceVsPrivate:
          coinSelection.mode === 'auto' && coinSelection.strategy === 'lower_fee' ? -100 : null
      },
      psbt: `cHNidP8BAF9kdW1teQ==${'A'.repeat(3120)}`,
      signed: 0,
      required: this._multisig.threshold,
      canFinalize: false,
      signedFingerprints: [],
      spendPath: 'primary',
      eligibleSignerFingerprints: this._multisig.cosigners.map((key) => key.fingerprint),
      status: 'collecting',
      createdAt: new Date().toISOString()
    };
    this._multisigProposals.set(proposal.proposalId, proposal);
    labels.forEach((item) => this.recordLabelUsage(item, 'payment'));
    return structuredClone(proposal);
  }
  async prepareMultisigPolicyRenewal(
    outpoint: string,
    rawLabels: string[],
    selectedRate: ReturnType<typeof feeRate>
  ) {
    const coin = this._coins.find((candidate) => candidate.outpoint === outpoint);
    if (!coin || coin.frozen)
      throw new WalletError('coin_unavailable', 'The selected coin is not available.');
    if (coin.policyMaturity?.state !== 'mature')
      throw new WalletError(
        'coin_unavailable',
        'The extra recovery or heir key cannot spend this coin yet.'
      );
    const fee = Math.ceil(Number(selectedRate) * 220);
    const proposal = await this.prepareMultisigPayment(
      fixtureAddressForNetwork('tb1qrenewedprotection0000000000000000000000'),
      rawLabels,
      sats(coin.amount - fee),
      selectedRate,
      { mode: 'manual', outpoints: [outpoint] }
    );
    proposal.selectionImpact = {
      ...proposal.selectionImpact,
      provenanceState: coin.provenance.state,
      hasUnknownProvenance: coin.provenance.state === 'unknown',
      fundingLabels: structuredClone(coin.provenance.labels)
    };
    this._multisigProposals.set(proposal.proposalId, proposal);
    return structuredClone(proposal);
  }
  async prepareMultisigDelayedSpend(
    outpoint: string,
    recipient: string,
    rawLabels: string[],
    selectedRate: ReturnType<typeof feeRate>
  ) {
    const coin = this._coins.find((candidate) => candidate.outpoint === outpoint);
    const multisig = this._multisig;
    const template = multisig?.recoveryTemplate;
    if (!coin || coin.frozen || coin.policyMaturity?.state !== 'mature')
      throw new WalletError('coin_unavailable', 'This coin is not ready for the extra key.');
    if (!multisig || !template || template.type !== 'recovery')
      throw new WalletError('internal_error', 'This wallet has no delayed spending key.');
    const fee = Math.ceil(Number(selectedRate) * 220);
    const proposal = await this.prepareMultisigPayment(
      recipient,
      rawLabels,
      sats(coin.amount - fee),
      selectedRate,
      { mode: 'manual', outpoints: [outpoint] }
    );
    const eligible = multisig.cosigners
      .filter((key) => template.recovery.signerIds.includes(key.id))
      .map((key) => key.fingerprint);
    proposal.spendPath = 'delayed';
    proposal.eligibleSignerFingerprints = eligible;
    proposal.required = template.recovery.threshold;
    this._multisigProposals.set(proposal.proposalId, proposal);
    return structuredClone(proposal);
  }
  async prepareMultisigAcceleration(
    txid: string,
    method: import('./contracts').AccelerationMethod,
    selectedRate: ReturnType<typeof feeRate>
  ) {
    const base = await this.prepareAcceleration(txid, method, selectedRate);
    const existing = this._multisigProposals.get(base.proposalId);
    if (existing) return structuredClone(existing);
    const proposal: MultisigProposal = {
      ...base,
      change: sats(0),
      changeAddresses: [],
      outputCount: 1,
      psbt: 'cHNidP8BAFICAAAA',
      signed: 0,
      required: this._multisig?.threshold ?? 2,
      canFinalize: false,
      signedFingerprints: [],
      spendPath: 'primary',
      eligibleSignerFingerprints: this._multisig?.cosigners.map((key) => key.fingerprint) ?? [],
      status: 'collecting',
      createdAt: new Date().toISOString()
    };
    this._multisigProposals.set(proposal.proposalId, proposal);
    return structuredClone(proposal);
  }
  async multisigProposals() {
    return [...this._multisigProposals.values()]
      .filter((item) => item.status === 'collecting' || item.status === 'ready')
      .map((item) => structuredClone(item));
  }
  async importMultisigProposal(proposalId: string, reviewedPsbt: string, signedPsbt: string) {
    if (!signedPsbt.trim()) throw new WalletError('internal_error', 'Enter a signed PSBT.');
    const proposal = this._multisigProposals.get(proposalId);
    if (proposal?.psbt !== reviewedPsbt)
      throw new WalletError('proposal_mismatch', 'The proposal changed after review.');
    if (signedPsbt === 'fixture-rejected-psbt')
      throw new WalletError(
        'proposal_mismatch',
        'The PSBT does not match the transaction you reviewed. No signatures were changed.'
      );
    return this.#addDummySignature(proposalId);
  }
  async signMultisigWithHardware(proposalId: string, deviceId: string, reviewedPsbt: string) {
    await new Promise((resolve) =>
      setTimeout(resolve, deviceId === 'virtual-ledger-outsider' ? 1500 : 250)
    );
    const proposal = this._multisigProposals.get(proposalId);
    if (proposal?.psbt !== reviewedPsbt)
      throw new WalletError('proposal_mismatch', 'The proposal changed after review.');
    const fingerprint =
      deviceId === 'virtual-coldcard'
        ? 'f00dbabe'
        : deviceId === 'virtual-trezor-cosigner'
          ? 'c0ffee01'
          : deviceId === 'virtual-ledger-outsider'
            ? '1ed9e001'
            : null;
    if (
      !fingerprint ||
      !this._multisig?.cosigners.some((signer) => signer.fingerprint.toLowerCase() === fingerprint)
    )
      throw new WalletError(
        'unknown_signer',
        'The connected device does not match any saved signer for this wallet.'
      );
    return this.#addDummySignature(proposalId, fingerprint);
  }
  async broadcastMultisigProposal(proposalId: string, reviewedPsbt: string, credential: string) {
    const proposal = this._multisigProposals.get(proposalId);
    if (!proposal) throw new WalletError('proposal_not_found', 'Payment proposal was not found.');
    if (proposal.psbt !== reviewedPsbt)
      throw new WalletError('proposal_mismatch', 'The signed proposal changed after review.');
    if (credential !== this._multisigCredential)
      throw new WalletError('invalid_credential', 'Incorrect app PIN.');
    if (!proposal.canFinalize)
      throw new WalletError('internal_error', 'Collect the required signatures first.');
    proposal.status = 'broadcast';
    this._balance = Math.max(0, this._balance - Number(proposal.total));
    const txid = '7d4a2c7f9e317f9859d7a8566fe02d773afb09fcddb617dbda98bfba8f721234';
    this.#recordFixtureBroadcast(proposalId, proposal, txid);
    this.#emit({ type: 'transaction_broadcast', txid, balance: sats(this._balance) });
    return { txid, snapshot: await this.snapshot(), syncPending: false };
  }
  async discardMultisigSignature(
    proposalId: string,
    reviewedPsbt: string,
    signerFingerprint: string
  ) {
    const proposal = this._multisigProposals.get(proposalId);
    if (!proposal) throw new WalletError('proposal_not_found', 'Payment proposal was not found.');
    if (proposal.psbt !== reviewedPsbt)
      throw new WalletError(
        'proposal_mismatch',
        'The proposal changed after review. Reload it before discarding a signature.'
      );
    const index = proposal.signedFingerprints.findIndex(
      (fingerprint) => fingerprint.toLowerCase() === signerFingerprint.toLowerCase()
    );
    if (index < 0)
      throw new WalletError(
        'signature_not_found',
        'This signer has no complete signature in the current proposal. No signatures were changed.'
      );
    proposal.signedFingerprints.splice(index, 1);
    proposal.signed = proposal.signedFingerprints.length;
    proposal.canFinalize = proposal.signed >= proposal.required;
    proposal.status = proposal.canFinalize ? 'ready' : 'collecting';
    proposal.psbt = `${proposal.psbt}:discarded-${signerFingerprint.toLowerCase()}`;
    return structuredClone(proposal);
  }
  async cancelMultisigProposal(proposalId: string) {
    const proposal = this._multisigProposals.get(proposalId);
    if (!proposal) throw new WalletError('proposal_not_found', 'Payment proposal was not found.');
    proposal.status = 'cancelled';
  }
  async verifyMultisigAddress(deviceId: string, addressId: number) {
    const rejectReview =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem('fixture-hardware-review-rejected') === '1';
    await new Promise((resolve) => setTimeout(resolve, rejectReview ? 800 : 250));
    if (rejectReview)
      throw new WalletError('hardware_cancelled', 'The address review was rejected on-device.');
    const device = (await this.listHardwareDevices()).find(
      (item) => item.id === deviceId && item.status === 'ready'
    );
    if (!device)
      throw new WalletError('hardware_unavailable', 'Connect and unlock a wallet signer.');
    if (
      !this._multisig?.cosigners.some(
        (cosigner) => cosigner.fingerprint.toLowerCase() === device.fingerprint?.toLowerCase()
      )
    )
      throw new WalletError(
        'unknown_signer',
        'The connected device does not match any saved signer for this wallet.'
      );
    const address = this._addresses.find((item) => item.id === addressId);
    if (!address) throw new WalletError('address_not_found', 'The receive address was not found.');
    const verified = {
      ...address,
      hardwareVerifiedAt: new Date().toISOString(),
      hardwareVerifiedBy: device.fingerprint
    };
    this._addresses = this._addresses.map((item) => (item.id === addressId ? verified : item));
    return structuredClone(verified);
  }
  async savePsbt(suggestedFilename: string, psbt: string) {
    const { downloadText } = await import('$lib/transfer');
    downloadText(suggestedFilename, psbt);
    return {
      saved: true,
      revealToken: '00000000-0000-4000-8000-000000000001',
      revealLabel: 'Show in Finder'
    };
  }
  async revealSavedFile(_revealToken: string) {}

  #addDummySignature(proposalId: string, fingerprint?: string) {
    const proposal = this._multisigProposals.get(proposalId);
    if (!proposal || !this._multisig)
      throw new WalletError('proposal_not_found', 'Payment proposal was not found.');
    const next = fingerprint
      ? this._multisig.cosigners.find(
          (key) =>
            key.fingerprint === fingerprint &&
            proposal.eligibleSignerFingerprints.includes(key.fingerprint)
        )
      : this._multisig.cosigners.find(
          (key) =>
            proposal.eligibleSignerFingerprints.includes(key.fingerprint) &&
            !proposal.signedFingerprints.includes(key.fingerprint)
        );
    if (!next)
      throw new WalletError(
        'unknown_signer',
        'The connected device does not match any saved signer for this wallet.'
      );
    if (proposal.signedFingerprints.includes(next.fingerprint))
      throw new WalletError(
        'no_new_signatures',
        'This signer has already signed this proposal. No signatures were changed.'
      );
    proposal.signedFingerprints.push(next.fingerprint);
    proposal.signed = proposal.signedFingerprints.length;
    proposal.canFinalize = proposal.signed >= proposal.required;
    proposal.status = proposal.canFinalize ? 'ready' : 'collecting';
    return structuredClone(proposal);
  }

  #recordFixtureBroadcast(proposalId: string, proposal: PaymentProposal, txid: string) {
    const acceleration = this._accelerations.get(proposalId);
    const original = acceleration
      ? this._transactions.find((transaction) => transaction.id === acceleration.originalTxid)
      : undefined;
    if (acceleration?.method === 'rbf' && original) {
      original.status = 'replaced';
      original.confirmations = 0;
      original.block = undefined;
      original.replacedBy = txid;
    }
    const replacement: Transaction = {
      id: txid,
      kind: acceleration?.method === 'cpfp' ? 'self_spend' : 'payment',
      direction: 'sent',
      amount: Number(proposal.amount),
      fee: Number(proposal.fee),
      status: 'pending',
      confirmations: 0,
      date: new Date().toISOString(),
      address: proposal.recipient,
      label: proposal.label,
      inputCount: proposal.inputs.length,
      outputCount: proposal.outputCount,
      feeRate: Number(proposal.feeRate),
      walletInputAmount: proposal.inputs.reduce((sum, input) => sum + Number(input.amount), 0),
      walletOutputAmount: Number(proposal.change),
      locktime: proposal.locktime,
      rbf: proposal.rbf,
      rbfHistory:
        acceleration?.method === 'rbf' && original
          ? {
              originalTxid: original.id,
              replacementTxid: txid,
              originalFeeRate: original.feeRate,
              replacementFeeRate: Number(proposal.feeRate),
              outcome: 'replacement_broadcast'
            }
          : undefined,
      intentLabel: original?.intentLabel ?? {
        id: `payment-${proposalId}`,
        text: proposal.label,
        origin: 'payment'
      },
      provenance: original?.provenance ?? {
        state: 'unknown',
        context: 'funding',
        labels: [],
        clusterCount: 0,
        addressReused: false
      },
      replaces: acceleration?.method === 'rbf' ? original?.id : undefined
    };
    this._transactions = [
      replacement,
      ...this._transactions.filter(
        (transaction) =>
          transaction.id !== txid &&
          !(acceleration?.method === 'rbf' && transaction.id === original?.id)
      )
    ];
    if (acceleration) this._accelerations.delete(proposalId);
  }

  subscribe(listener: (event: WalletEvent) => void) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  #emit(event: WalletEvent) {
    this._listeners.forEach((listener) => listener(event));
  }
}
