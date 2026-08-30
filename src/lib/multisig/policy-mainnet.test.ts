import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('mainnet multisig policy identity', () => {
  it('uses mainnet BIP48 origins and extended public keys', async () => {
    vi.stubEnv('PUBLIC_BITCOIN_NETWORK', 'mainnet');
    vi.resetModules();

    const { MULTISIG_ACCOUNT_PATH, validatePolicyDraft } = await import('./policy');
    const cosigners = ['a1b2c3d4', 'b1b2c3d4', 'c1b2c3d4'].map((fingerprint, index) => ({
      id: String(index),
      label: `Signer ${index + 1}`,
      fingerprint,
      xpub: `xpub-mainnet-key-${index}`,
      derivationPath: "m/48'/0'/0'/2'" as const,
      source: 'manual' as const
    }));

    expect(MULTISIG_ACCOUNT_PATH).toBe("m/48'/0'/0'/2'");
    expect(validatePolicyDraft({ name: 'Mainnet vault', threshold: 2, cosigners })).toEqual([]);
    expect(
      validatePolicyDraft({
        name: 'Mainnet vault',
        threshold: 2,
        cosigners: cosigners.map((cosigner) => ({ ...cosigner, xpub: `tpub-${cosigner.id}` }))
      })
    ).toContain('Every account key must use a mainnet extended public key.');
  });
});
