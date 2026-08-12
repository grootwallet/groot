import { describe, expect, it } from 'vitest';
import { parsePublicCosignerFile } from './cosigner-import';

describe('public signer file import', () => {
  it('accepts bounded Groot and Coldcard-style test-chain exports', () => {
    expect(parsePublicCosignerFile(JSON.stringify({
      version: 1,
      label: 'Offline signer',
      fingerprint: 'A1B2C3D4',
      accountXpub: 'tpub-public-account-key',
      derivationPath: "m/48'/1'/0'/2'"
    }), 'fallback')).toMatchObject({ label: 'Offline signer', fingerprint: 'a1b2c3d4' });

    expect(parsePublicCosignerFile(JSON.stringify({
      xfp: 'F00DBABE',
      p2wsh: 'tpub-coldcard-public-account-key',
      p2wsh_deriv: "m/48'/1'/0'/2'"
    }), 'coldcard-export')).toMatchObject({ label: 'coldcard-export', fingerprint: 'f00dbabe' });
  });

  it('rejects private material, wrong networks, malformed keys, and invalid labels', () => {
    const valid = { fingerprint: 'a1b2c3d4', accountXpub: 'tpub-public', derivationPath: "m/48'/1'/0'/2'" };
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, mnemonic: 'never accept this' }), 'signer')).toThrow(/forbidden/);
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, accountXpub: 'tprv-private' }), 'signer')).toThrow(/forbidden/);
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, derivationPath: "m/48'/0'/0'/2'" }), 'signer')).toThrow(/must use/);
    expect(() => parsePublicCosignerFile(JSON.stringify({ ...valid, fingerprint: 'nope' }), 'signer')).toThrow(/fingerprint/);
    expect(() => parsePublicCosignerFile(JSON.stringify(valid), '')).toThrow(/label/);
  });
});
