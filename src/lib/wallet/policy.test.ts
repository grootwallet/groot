import { describe, expect, it } from 'vitest';
import type { Utxo } from '$lib/types';
import { feeRate, sats, WalletError, type MultisigWallet } from './contracts';
import {
  addressPrefixForNetwork,
  addressReuseInsights,
  awaitingPaymentAddresses,
  canDiscardAddress,
  hasMiniscriptPolicy,
  hasAddressPrefixForNetwork,
  normalizeCoinSelection,
  normalizePermanentLabel,
  approximateBlockDuration,
  policyMaturitySummary,
  recoveryWordCountIsValid,
  selectedCoinTotal,
  validPolicyMaturity,
  walletPolicyPresentation
} from './policy';

describe('wallet invariants', () => {
  it('exposes recovery-only controls only for wallets with a Miniscript template', () => {
    expect(hasMiniscriptPolicy(null)).toBe(false);
    expect(hasMiniscriptPolicy({})).toBe(false);
    expect(hasMiniscriptPolicy({ recoveryTemplate: null })).toBe(false);
    expect(
      hasMiniscriptPolicy({
        recoveryTemplate: {
          type: 'decaying',
          stages: [{ availableAfterBlocks: 0, threshold: 2, signerIds: ['key-0', 'key-1'] }]
        }
      })
    ).toBe(true);
  });

  it('summarizes a standard multisig policy without a delayed key', () => {
    expect(
      walletPolicyPresentation({
        threshold: 2,
        cosigners: [{ id: 'key-0' }, { id: 'key-1' }, { id: 'key-2' }]
      } as MultisigWallet)
    ).toEqual({
      delayed: false,
      primaryThreshold: 2,
      primarySignerCount: 3,
      delayedKeyLabel: null,
      summary: '2 of 3'
    });
  });

  it('describes delayed key roles without pretending all four keys share one threshold', () => {
    const wallet = {
      threshold: 2,
      policyType: 'recovery',
      cosigners: [0, 1, 2, 3].map((index) => ({ id: `key-${index}` })),
      recoveryTemplate: {
        type: 'recovery',
        immediate: { threshold: 2, signerIds: ['key-0', 'key-1', 'key-2'] },
        recovery: { threshold: 1, signerIds: ['key-3'], availableAfterBlocks: 4_320 }
      }
    } as MultisigWallet;
    expect(walletPolicyPresentation(wallet).summary).toBe(
      '2 of 3 primary keys + recovery key later'
    );
    expect(
      walletPolicyPresentation({
        ...wallet,
        policyType: 'inheritance'
      }).delayedKeyLabel
    ).toBe('Heir key');
    expect(
      walletPolicyPresentation({
        ...wallet,
        recoveryTemplate: {
          ...wallet.recoveryTemplate!,
          immediate: { threshold: 2, signerIds: ['key-0', 'missing'] }
        }
      } as MultisigWallet).summary
    ).toBe('Policy details unavailable');
  });
  it('uses the active network address prefix', () => {
    expect(addressPrefixForNetwork('regtest')).toBe('bcrt1');
    expect(addressPrefixForNetwork('signet')).toBe('tb1');
    expect(addressPrefixForNetwork('testnet4')).toBe('tb1');
    expect(addressPrefixForNetwork('mainnet')).toBe('bc1');
    expect(hasAddressPrefixForNetwork(' bcrt1qfixtureaddress000 ', 'regtest')).toBe(true);
    expect(hasAddressPrefixForNetwork('tb1qfixtureaddress000', 'signet')).toBe(true);
    expect(hasAddressPrefixForNetwork('tb1qfixtureaddress000', 'testnet4')).toBe(true);
    expect(hasAddressPrefixForNetwork('tb1qfixtureaddress000', 'regtest')).toBe(false);
    expect(hasAddressPrefixForNetwork('bcrt1short', 'regtest')).toBe(false);
    expect(hasAddressPrefixForNetwork('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'regtest')).toBe(true);
    expect(
      hasAddressPrefixForNetwork('bc1qrur4qp60xej8v5st3e58xh6vnaqsfh0mf8w6kj', 'mainnet')
    ).toBe(true);
    expect(hasAddressPrefixForNetwork('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 'mainnet')).toBe(true);
    expect(hasAddressPrefixForNetwork('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'mainnet')).toBe(true);
    expect(hasAddressPrefixForNetwork('bc1pfixtureaddress000', 'mainnet')).toBe(true);
    expect(hasAddressPrefixForNetwork('tb1qfixtureaddress000', 'mainnet')).toBe(false);
    expect(hasAddressPrefixForNetwork('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'testnet4')).toBe(true);
    expect(hasAddressPrefixForNetwork('2N47mmrWXsNBvQR6k78hWJoTji57zXwNcU7', 'signet')).toBe(true);
  });

  it('requires and freezes a normalized address label at creation', () => {
    expect(normalizePermanentLabel('  Invoice   104 ')).toBe('Invoice 104');
    expect(normalizePermanentLabel('Café 🌱')).toBe('Café 🌱');
    expect(normalizePermanentLabel('🌱'.repeat(48))).toBe('🌱'.repeat(48));
    expect(() => normalizePermanentLabel('   ')).toThrow('required');
    expect(() => normalizePermanentLabel('x'.repeat(49))).toThrow('48');
    expect(() => normalizePermanentLabel('🌱'.repeat(49))).toThrow('48');
  });

  it('allows discarding only an awaiting address with no observed payment', () => {
    const awaiting = {
      id: 1,
      address: 'tb1qexample',
      label: 'Invoice',
      created: 'now',
      status: 'awaiting' as const,
      derivationPath: "m/84'/1'/0'/0/1"
    };
    expect(canDiscardAddress(awaiting, false)).toBe(true);
    expect(canDiscardAddress(awaiting, true)).toBe(false);
    expect(canDiscardAddress({ ...awaiting, status: 'used' }, false)).toBe(false);
  });

  it('keeps every awaiting address available for independent payment requests', () => {
    const first = {
      id: 1,
      address: 'tb1qfirst',
      label: 'First',
      created: 'now',
      status: 'awaiting' as const,
      derivationPath: "m/84'/1'/0'/0/1"
    };
    const second = {
      ...first,
      id: 2,
      address: 'tb1qsecond',
      label: 'Second',
      derivationPath: "m/84'/1'/0'/0/2"
    };
    const used = { ...first, id: 3, status: 'used' as const };
    expect(awaitingPaymentAddresses([first, used, second])).toEqual([first, second]);
  });

  it('accepts exactly 24 recovery words', () => {
    expect(
      recoveryWordCountIsValid(Array.from({ length: 24 }, (_, index) => `word${index}`).join(' '))
    ).toBe(true);
    expect(
      recoveryWordCountIsValid(Array.from({ length: 12 }, (_, index) => `word${index}`).join(' '))
    ).toBe(false);
    expect(recoveryWordCountIsValid('   ')).toBe(false);
  });

  it('rejects unsafe amounts and invalid fee rates at the boundary', () => {
    expect(() => sats(-1)).toThrow(WalletError);
    expect(() => sats(1.2)).toThrow(WalletError);
    expect(() => feeRate(0)).toThrow(WalletError);
    expect(() => sats(Number.MAX_SAFE_INTEGER + 1)).toThrow(WalletError);
    expect(() => feeRate(Number.NaN)).toThrow(WalletError);
    expect(sats(0)).toBe(0);
    expect(feeRate(1.5)).toBe(1.5);
  });

  it('keeps automatic selection as the safe default and rejects invalid manual selections', () => {
    expect(normalizeCoinSelection(undefined)).toEqual({ mode: 'auto', strategy: 'balanced' });
    expect(normalizeCoinSelection({ mode: 'auto' })).toEqual({
      mode: 'auto',
      strategy: 'balanced'
    });
    expect(normalizeCoinSelection({ mode: 'auto', strategy: 'private' })).toEqual({
      mode: 'auto',
      strategy: 'private'
    });
    expect(normalizeCoinSelection({ mode: 'manual', outpoints: ['a:0', 'a:0', 'b:1'] })).toEqual({
      mode: 'manual',
      outpoints: ['a:0', 'b:1']
    });
    expect(() => normalizeCoinSelection({ mode: 'manual', outpoints: [] })).toThrow(
      'Select at least one available coin'
    );
  });

  it('totals only selected, available coins', () => {
    const coins = [
      { outpoint: 'a:0', amount: 10, confirmations: 1, address: 'a', label: 'A', frozen: false },
      { outpoint: 'b:1', amount: 20, confirmations: 1, address: 'b', label: 'B', frozen: true }
    ];
    expect(selectedCoinTotal(coins, ['a:0', 'missing:0'])).toBe(10);
    expect(selectedCoinTotal(coins, ['b:1'])).toBe(0);
  });

  it('identifies coins received to the same known address without changing spendability', () => {
    const coins = [
      {
        outpoint: 'a:0',
        amount: 10,
        confirmations: 1,
        address: ' bcrt1qreused ',
        label: 'First payment',
        frozen: false
      },
      {
        outpoint: 'b:1',
        amount: 20,
        confirmations: 2,
        address: 'bcrt1qother',
        label: 'Other',
        frozen: false
      },
      {
        outpoint: 'c:0',
        amount: 30,
        confirmations: 0,
        address: 'bcrt1qreused',
        label: 'Second payment',
        frozen: true
      },
      {
        outpoint: 'e:0',
        amount: 5,
        confirmations: 1,
        address: 'bcrt1qreused',
        label: 'Second payment',
        frozen: false
      },
      {
        outpoint: 'f:0',
        amount: 7,
        confirmations: 1,
        address: 'bcrt1qreused',
        label: '',
        frozen: false
      },
      {
        outpoint: 'd:0',
        amount: 40,
        confirmations: 3,
        address: 'Unknown',
        label: 'Unknown',
        frozen: false
      }
    ];

    expect(addressReuseInsights(coins)).toEqual([
      {
        address: 'bcrt1qreused',
        outpoints: ['a:0', 'c:0', 'e:0', 'f:0'],
        labels: ['First payment', 'Second payment'],
        totalAmount: 52
      }
    ]);
  });

  it('does not report distinct, empty, or unknown addresses as reused', () => {
    const coins = [
      {
        outpoint: 'a:0',
        amount: 10,
        confirmations: 1,
        address: 'bcrt1qfirst',
        label: 'First',
        frozen: false
      },
      {
        outpoint: 'b:0',
        amount: 20,
        confirmations: 1,
        address: 'bcrt1qsecond',
        label: 'Second',
        frozen: false
      },
      {
        outpoint: 'e:0',
        amount: 5,
        confirmations: 1,
        address: 'bcrt1qunlabeled',
        label: '',
        frozen: false
      },
      {
        outpoint: 'c:0',
        amount: 30,
        confirmations: 1,
        address: '',
        label: 'Missing',
        frozen: false
      },
      {
        outpoint: 'd:0',
        amount: 40,
        confirmations: 1,
        address: 'unknown',
        label: 'Unknown',
        frozen: false
      }
    ];

    expect(addressReuseInsights(coins)).toEqual([]);
  });

  it('summarizes authoritative per-coin maturity without claiming stale data is current', () => {
    const base: Omit<Utxo, 'outpoint' | 'policyMaturity'> = {
      amount: 10,
      confirmations: 1,
      address: 'bcrt1qpolicy',
      label: 'Policy coin',
      frozen: false,
      primaryLabel: null,
      provenance: {
        state: 'known',
        context: 'received',
        labels: [],
        clusterCount: 1,
        addressReused: false
      }
    };
    const maturity = {
      policyType: 'recovery' as const,
      delayBlocks: 4_320,
      ageBlocks: 3_500,
      approachingAtBlocks: 1_008,
      maturityHeight: 204_320,
      approximateSecondsRemaining: 820 * 600,
      delayedSpendSupported: false as const
    };
    expect(validPolicyMaturity({ ...base, outpoint: 'none:0' })).toBeNull();
    expect(
      validPolicyMaturity({
        ...base,
        outpoint: 'invalid-support:0',
        policyMaturity: {
          ...maturity,
          state: 'approaching',
          remainingBlocks: 820,
          delayedSpendSupported: 'yes' as unknown as boolean
        }
      })
    ).toBeNull();
    const coins: Utxo[] = [
      {
        ...base,
        outpoint: 'a:0',
        policyMaturity: { ...maturity, state: 'approaching' as const, remainingBlocks: 820 }
      },
      {
        ...base,
        outpoint: 'b:0',
        policyMaturity: { ...maturity, state: 'mature' as const, remainingBlocks: 0 }
      },
      {
        ...base,
        outpoint: 'c:0',
        policyMaturity: {
          ...maturity,
          state: 'unconfirmed' as const,
          ageBlocks: 0,
          remainingBlocks: null,
          maturityHeight: null,
          approximateSecondsRemaining: null
        }
      }
    ];
    expect(
      policyMaturitySummary(coins, { height: 200_000, observedAt: null, status: 'stale' })
    ).toEqual({
      policyType: 'recovery',
      total: 3,
      unconfirmed: 1,
      immature: 0,
      approaching: 1,
      mature: 1,
      nextRemainingBlocks: 820,
      chainCurrent: false
    });
    expect(
      policyMaturitySummary(
        [
          {
            ...base,
            outpoint: 'd:0',
            policyMaturity: {
              ...maturity,
              state: 'immature',
              ageBlocks: 12,
              remainingBlocks: 4_308,
              approximateSecondsRemaining: 4_308 * 600
            }
          }
        ],
        { height: 200_000, observedAt: '1', status: 'recent' }
      )
    ).toEqual({
      policyType: 'recovery',
      total: 1,
      unconfirmed: 0,
      immature: 1,
      approaching: 0,
      mature: 0,
      nextRemainingBlocks: 4_308,
      chainCurrent: true
    });
    expect(
      policyMaturitySummary([coins[1]], {
        height: 200_000,
        observedAt: '1',
        status: 'recent'
      })
    ).toMatchObject({ nextRemainingBlocks: null, chainCurrent: true });
    expect(
      policyMaturitySummary(
        [
          coins[0],
          {
            ...coins[1],
            policyMaturity: { ...coins[1].policyMaturity!, policyType: 'inheritance' }
          }
        ],
        { height: 200_000, observedAt: '1', status: 'recent' }
      )
    ).toBeNull();
  });

  it('rejects hostile maturity DTO values and formats time as secondary approximation', () => {
    const hostile = {
      outpoint: 'a:0',
      amount: 1,
      confirmations: 1,
      address: 'a',
      label: 'A',
      frozen: false,
      primaryLabel: null,
      provenance: {
        state: 'known' as const,
        context: 'received' as const,
        labels: [],
        clusterCount: 1,
        addressReused: false
      },
      policyMaturity: {
        state: 'mature' as const,
        policyType: 'recovery' as const,
        delayBlocks: 4_320,
        ageBlocks: 4_320,
        remainingBlocks: 10,
        approachingAtBlocks: 1_008,
        maturityHeight: 10,
        approximateSecondsRemaining: 0,
        delayedSpendSupported: false as const
      }
    };
    expect(
      policyMaturitySummary([hostile], { height: 10, observedAt: null, status: 'recent' })
    ).toBeNull();
    expect(approximateBlockDuration(7 * 86_400)).toEqual({ value: 7, unit: 'days' });
    expect(approximateBlockDuration(400 * 86_400)).toEqual({ value: 14, unit: 'months' });
    expect(approximateBlockDuration(800 * 86_400)).toEqual({ value: 3, unit: 'years' });
    expect(approximateBlockDuration(null)).toBeNull();
  });
});
