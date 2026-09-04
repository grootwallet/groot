import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/config', () => ({
  defaultConfig: {
    network: 'mainnet',
    esploraUrl: null,
    explorerUrl: null
  }
}));

describe('mainnet multisig policy invariants', () => {
  it('requires the mainnet BIP48 account path and extended public keys', async () => {
    const { MULTISIG_ACCOUNT_PATH, validatePolicyDraft } = await import('./policy');
    const cosigners = ['a1b2c3d4', 'b1b2c3d4', 'c1b2c3d4'].map((fingerprint, index) => ({
      id: `signer-${index}`,
      label: `Signer ${index}`,
      fingerprint,
      xpub: `xpub-mainnet-key-${index}`,
      derivationPath: "m/48'/0'/0'/2'",
      source: 'manual' as const
    }));

    expect(MULTISIG_ACCOUNT_PATH).toBe("m/48'/0'/0'/2'");
    expect(validatePolicyDraft({ name: 'Mainnet vault', threshold: 2, cosigners })).toEqual([]);

    cosigners[0] = { ...cosigners[0], xpub: 'tpub-test-network-key' };
    expect(validatePolicyDraft({ name: 'Mainnet vault', threshold: 2, cosigners })).toContain(
      'Every account key must use a mainnet extended public key.'
    );
  });
});
