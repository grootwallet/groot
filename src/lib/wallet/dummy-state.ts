import { defaultConfig } from '$lib/config';
import { receiveAddresses, transactions, utxos, wallet } from '$lib/data';
import type { PolicyDraft } from '$lib/multisig/policy';
import { descriptorPreview, MULTISIG_ACCOUNT_PATH } from '$lib/multisig/policy';
import { addressPrefixForNetwork } from './policy';
import type {
  CoreNodeConfig,
  ExternalSignerWallet,
  MultisigProposal,
  MultisigWallet,
  PaymentProposal,
  RecoveryScanStatus,
  WalletEvent,
  WalletProfile,
  WalletSyncSource
} from './contracts';

export const prototypeCredential = 'prototype-passphrase';
export const fixtureCosigners: PolicyDraft['cosigners'] = [
  {
    id: 'fixture-coldcard',
    label: 'Coldcard',
    fingerprint: 'f00dbabe',
    xpub: 'tpubD6NzVbkrYhZ4Y-fixture-coldcard-public-key',
    derivationPath: MULTISIG_ACCOUNT_PATH,
    source: 'virtual',
    deviceType: 'coldcard'
  },
  {
    id: 'fixture-trezor',
    label: 'Trezor',
    fingerprint: 'c0ffee01',
    xpub: 'tpubD6NzVbkrYhZ4Y-fixture-trezor-public-key',
    derivationPath: MULTISIG_ACCOUNT_PATH,
    source: 'virtual',
    deviceType: 'trezor'
  },
  {
    id: 'fixture-backup',
    label: 'Offline backup',
    fingerprint: 'deadbeef',
    xpub: 'tpubD6NzVbkrYhZ4Y-fixture-backup-public-key',
    derivationPath: MULTISIG_ACCOUNT_PATH,
    source: 'manual'
  }
];

export function fixtureAddressForNetwork(address: string): string {
  return address.replace(/^(tb1|bcrt1)/, addressPrefixForNetwork(defaultConfig.network));
}

export function fixtureMultisigWallet(): MultisigWallet {
  return {
    kind: 'multisig',
    name: 'Family wallet',
    threshold: 2,
    cosigners: structuredClone(fixtureCosigners),
    externalDescriptor: descriptorPreview(2, fixtureCosigners, 0),
    internalDescriptor: descriptorPreview(2, fixtureCosigners, 1),
    createdAt: '2026-07-17T10:00:00.000Z',
    policyType: 'standard'
  };
}

export abstract class DummyWalletState {
  protected _exists =
    typeof location === 'undefined' || !new URLSearchParams(location.search).has('fixture-empty');
  protected _listeners = new Set<(event: WalletEvent) => void>();
  protected _proposals = new Map<string, PaymentProposal>();
  protected _accelerations = new Map<string, { originalTxid: string; method: 'rbf' | 'cpfp' }>();
  protected _transactions = structuredClone(transactions);
  protected _multisig: MultisigWallet | null = this._exists ? fixtureMultisigWallet() : null;
  protected _multisigCredential = this._exists ? prototypeCredential : '';
  protected _multisigProfileId: string | null = this._exists ? 'fixture-multisig' : null;
  protected _multisigProposals = new Map<string, MultisigProposal>();
  protected _recoveryVerified = false;
  protected _externalWallet: ExternalSignerWallet | null = null;
  protected _externalProposals = new Map<string, MultisigProposal>();
  protected _profiles: WalletProfile[] = this._exists
    ? [
        {
          id: 'fixture-single',
          name: 'Everyday wallet',
          network: defaultConfig.network,
          kind: 'single_key',
          descriptorChecksum: 'fixture01',
          createdAt: 1,
          backupVerified: true
        },
        {
          id: 'fixture-multisig',
          name: 'Family wallet',
          network: defaultConfig.network,
          kind: 'multisig',
          descriptorChecksum: 'demo2of3',
          createdAt: 2,
          backupVerified: true
        }
      ]
    : [];
  protected _selectedWalletId: string | null = this._profiles[0]?.id ?? null;
  protected _inactivityTimeoutMinutes = 5;
  protected _credentials = new Map<string, string>(
    this._profiles.map((profile) => [profile.id, prototypeCredential])
  );
  protected _unlockedWalletIds = new Set<string>(
    typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-locked-wallet-switch')
      ? []
      : typeof location !== 'undefined' &&
          new URLSearchParams(location.search).has('fixture-delayed-wallet-switch')
        ? this._profiles.map((profile) => profile.id)
        : this._profiles[0]
          ? [this._profiles[0].id]
          : []
  );
  protected _coins = structuredClone(utxos).map((coin) => ({
    ...coin,
    address: fixtureAddressForNetwork(coin.address)
  }));
  protected _addresses = structuredClone(receiveAddresses).map((address) => ({
    ...address,
    address: fixtureAddressForNetwork(address.address)
  }));
  protected _balance = wallet.balance;
  protected _pendingBalance = wallet.pending;
  protected _nodeConfig: CoreNodeConfig = {
    backend: { type: 'local_core', url: 'http://127.0.0.1:18443' },
    auth: 'cookie',
    username: null
  };
  protected _syncSource: WalletSyncSource = { type: 'bitcoin_core' };
  protected _scanSettings = { birthdayHeight: 0, gapLimit: 20 };
  protected _scanStatus: RecoveryScanStatus = {
    status: 'idle',
    birthdayHeight: 0,
    gapLimit: 20,
    currentHeight: 0,
    targetHeight: 0,
    processedBlocks: 0,
    totalBlocks: 0,
    startedAt: 0,
    updatedAt: 0
  };
  protected _holdFirstRecoveryScan =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('fixture-hold-first-recovery-scan');
  protected _recoveryScanAttempts = 0;
  protected _trezorPinUnlocked = false;
  protected _secureStorageRetryPending =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('fixture-secure-storage-retry');
  protected _delayedWalletDataPending =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('fixture-delayed-wallet-data');
  protected _delayedWalletSwitch =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('fixture-delayed-wallet-switch');
  protected _feeEstimatesUnavailable =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('fixture-fee-estimates-unavailable');
  protected _emptyActivitySyncScheduled = false;
}
