import { defaultConfig } from '$lib/config';
import { receiveAddresses, transactions, utxos, wallet } from '$lib/data';
import type { PolicyDraft } from '$lib/multisig/policy';
import { descriptorPreview, MULTISIG_ACCOUNT_PATH } from '$lib/multisig/policy';
import type { Utxo } from '$lib/types';
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
type FixtureDelayedPolicyType = 'recovery' | 'inheritance';

function fixtureDelayedPolicyType(): FixtureDelayedPolicyType | null {
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  if (params.has('fixture-policy-inheritance')) return 'inheritance';
  return params.has('fixture-policy-maturity') ? 'recovery' : null;
}
const fixtureDelayedPolicy = fixtureDelayedPolicyType();

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

function fixtureCoins(): Utxo[] {
  const coins = structuredClone(utxos);
  const maturityFixture = fixtureDelayedPolicy !== null;

  if (!maturityFixture) return coins;

  return [
    ...coins,
    {
      ...structuredClone(coins[2]),
      outpoint: 'fixture-unconfirmed-policy-output:0',
      amount: 125_000,
      confirmations: 0,
      label: 'New payment',
      primaryLabel: null,
      provenance: {
        state: 'known',
        context: 'received',
        labels: [],
        clusterCount: 1,
        addressReused: false
      }
    }
  ];
}

export function fixtureMultisigWallet(): MultisigWallet {
  const policyType = fixtureDelayedPolicy;
  const maturityFixture = policyType !== null;
  const delayBlocks = policyType === 'inheritance' ? 52_560 : 4_320;
  const policyCosigners = maturityFixture
    ? [
        ...fixtureCosigners,
        {
          id: 'fixture-recovery',
          label: policyType === 'inheritance' ? 'Heir key' : 'Recovery key',
          fingerprint: 'a11ce404',
          xpub: 'tpubD6NzVbkrYhZ4Y-fixture-recovery-public-key',
          derivationPath: MULTISIG_ACCOUNT_PATH,
          source: 'manual' as const
        }
      ]
    : fixtureCosigners;
  return {
    kind: 'multisig',
    name: 'Family wallet',
    threshold: 2,
    cosigners: structuredClone(policyCosigners),
    externalDescriptor: descriptorPreview(2, fixtureCosigners, 0),
    internalDescriptor: descriptorPreview(2, fixtureCosigners, 1),
    createdAt: '2026-07-17T10:00:00.000Z',
    policyType: policyType ?? 'standard',
    recoveryTemplate: maturityFixture
      ? {
          type: 'recovery',
          immediate: {
            threshold: 2,
            signerIds: policyCosigners.map((signer) => signer.id).slice(0, 3)
          },
          recovery: {
            availableAfterBlocks: delayBlocks,
            threshold: 1,
            signerIds: [policyCosigners[3].id]
          }
        }
      : undefined,
    spendingPaths: maturityFixture
      ? [
          {
            availableAfterBlocks: 0,
            threshold: 2,
            signerIds: policyCosigners.map((signer) => signer.id).slice(0, 3)
          },
          { availableAfterBlocks: delayBlocks, threshold: 1, signerIds: [policyCosigners[3].id] }
        ]
      : undefined
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
  protected _selectedWalletId: string | null =
    fixtureDelayedPolicy !== null
      ? (this._multisigProfileId ?? this._profiles[0]?.id ?? null)
      : (this._profiles[0]?.id ?? null);
  protected _inactivityTimeoutMinutes = 5;
  protected _credentials = new Map<string, string>(
    this._profiles.map((profile) => [profile.id, prototypeCredential])
  );
  protected _unlockedWalletIds = new Set<string>(
    typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('fixture-locked-wallet-switch')
      ? []
      : typeof location !== 'undefined' &&
          (new URLSearchParams(location.search).has('fixture-delayed-wallet-switch') ||
            fixtureDelayedPolicy !== null)
        ? this._profiles.map((profile) => profile.id)
        : this._profiles[0]
          ? [this._profiles[0].id]
          : []
  );
  protected _coins = fixtureCoins().map((coin, index) => ({
    ...coin,
    confirmations:
      fixtureDelayedPolicy !== null
        ? index === 0
          ? fixtureDelayedPolicy === 'inheritance'
            ? 52_560
            : 4_320
          : index === 1
            ? fixtureDelayedPolicy === 'inheritance'
              ? 48_000
              : 3_500
            : index === 2
              ? 12
              : 0
        : coin.confirmations,
    address: fixtureAddressForNetwork(coin.address),
    policyMaturity:
      fixtureDelayedPolicy !== null
        ? (() => {
            const policyType = fixtureDelayedPolicy;
            const delayBlocks = policyType === 'inheritance' ? 52_560 : 4_320;
            const approachingAge = policyType === 'inheritance' ? 48_000 : 3_500;
            const approachingRemaining = delayBlocks - approachingAge;
            const immatureRemaining = delayBlocks - 12;
            return {
              state:
                index === 0
                  ? ('mature' as const)
                  : index === 1
                    ? ('approaching' as const)
                    : index === 2
                      ? ('immature' as const)
                      : ('unconfirmed' as const),
              policyType,
              delayBlocks,
              ageBlocks:
                index === 0 ? delayBlocks : index === 1 ? approachingAge : index === 2 ? 12 : 0,
              remainingBlocks:
                index === 0
                  ? 0
                  : index === 1
                    ? approachingRemaining
                    : index === 2
                      ? immatureRemaining
                      : null,
              approachingAtBlocks: policyType === 'inheritance' ? 5_256 : 1_008,
              maturityHeight:
                index === 0
                  ? 250_000
                  : index === 1
                    ? 250_000 + approachingRemaining
                    : index === 2
                      ? 250_000 + immatureRemaining
                      : null,
              approximateSecondsRemaining:
                index === 0
                  ? 0
                  : index === 1
                    ? approachingRemaining * 600
                    : index === 2
                      ? immatureRemaining * 600
                      : null,
              delayedSpendSupported: true
            };
          })()
        : null
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
