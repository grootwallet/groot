import { describe, expect, it } from 'vitest';
import { parsePublicCosignerFile, PublicCosignerImportError } from './cosigner-import';

describe('public signer file import', () => {
  it('accepts bounded Groot and Coldcard-style test-chain exports', () => {
    expect(parsePublicCosignerFile(JSON.stringify({
      version: 1,
      label: 'Offline signer',
      fingerprint: 'A1B2C3D4',
      accountXpub: 'tpub-public-account-key',
      derivationPath: "m/48'/1'/0'/2'"
    }), 'fallback')).toMatchObject({ label: 'Offline signer', fingerprint: 'a1b2c3d4', deviceType: null });

    expect(parsePublicCosignerFile(JSON.stringify({
      xfp: 'F00DBABE',
      p2wsh: 'tpub-coldcard-public-account-key',
      p2wsh_deriv: "m/48'/1'/0'/2'"
    }), 'coldcard-export')).toMatchObject({ label: 'coldcard-export', fingerprint: 'f00dbabe', deviceType: 'coldcard' });

    expect(parsePublicCosignerFile(JSON.stringify({
      p2wsh_desc: 'wsh([F00DBABE/48h/1h/0h/2h]tpub-coldcard-descriptor-key/0/*)'
    }), 'ccxp-export')).toMatchObject({
      label: 'ccxp-export',
      fingerprint: 'f00dbabe',
      xpub: 'tpub-coldcard-descriptor-key',
      derivationPath: "m/48'/1'/0'/2'",
      deviceType: 'coldcard'
    });

    expect(parsePublicCosignerFile(JSON.stringify({
      xfp: 'F00DBABE',
      xpub: 'xpub-generic-master-key-that-must-not-be-selected',
      p2wsh: 'Vpub-slip132-regtest-account-key-that-must-not-be-selected',
      p2wsh_deriv: "m/48h/1h/0h/2h",
      p2wsh_desc: 'wsh(sortedmulti(M,[F00DBABE/48h/1h/0h/2h]tpub-regtest-bip48-account-key/0/*,...))'
    }), 'mixed-coldcard-export')).toMatchObject({
      fingerprint: 'f00dbabe',
      xpub: 'tpub-regtest-bip48-account-key',
      derivationPath: "m/48'/1'/0'/2'",
      deviceType: 'coldcard'
    });
  });

  it('rejects private material, wrong networks, malformed keys, and invalid labels', () => {
    const valid = { fingerprint: 'a1b2c3d4', accountXpub: 'tpub-public', derivationPath: "m/48'/1'/0'/2'" };
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, mnemonic: 'never accept this' }), 'signer')).toThrow(/private key or recovery data/);
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, accountXpub: 'tprv-private' }), 'signer')).toThrow(/private key or recovery data/);
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, derivationPath: "m/48'/0'/0'/2'" }), 'signer')).toThrow(/wrong multisig account path/);
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, fingerprint: 'nope' }), 'signer')).toThrow(/fingerprint/);
    expect(() => parsePublicCosignerFile(JSON.stringify(valid), '')).toThrow(/label/);
  });

  it('explains how to correct a mainnet Coldcard export', () => {
    try {
      parsePublicCosignerFile(JSON.stringify({
        xfp: 'F00DBABE',
        p2wsh: 'xpub-mainnet-account-key',
        p2wsh_deriv: "m/48'/0'/0'/2'"
      }), 'coldcard');
      expect.fail('expected a network error');
    } catch (cause) {
      expect(cause).toBeInstanceOf(PublicCosignerImportError);
      expect(cause).toMatchObject({ code: 'wrong_network' });
      expect((cause as PublicCosignerImportError).guidance).toContain('Testnet Mode → Regtest');
    }
  });
});
