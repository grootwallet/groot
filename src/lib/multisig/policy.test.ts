import { describe, expect, it } from 'vitest';
import {
  MULTISIG_ACCOUNT_PATH,
  coordinatorProgress,
  descriptorPreview,
  findDuplicateCosigner,
  normalizeCosigner,
  normalizeSignerLabel,
  signerLabelError,
  validatePolicyDraft,
  type CosignerDraft
} from './policy';

const cosigner = (overrides: Partial<CosignerDraft> = {}): CosignerDraft => ({
  id: crypto.randomUUID(),
  label: 'Coldcard',
  fingerprint: 'a1b2c3d4',
  xpub: 'tpubD6NzVbkrYhZ4Y-public-regtest-key-1',
  derivationPath: "m/48'/1'/0'/2'",
  source: 'manual',
  ...overrides
});

describe('multisig policy invariants', () => {
  it('normalizes and bounds editable signer names', () => {
    expect(normalizeSignerLabel('  Office   Coldcard  ')).toBe('Office Coldcard');
    expect(signerLabelError('   ')).toBe('Enter a signer name.');
    expect(signerLabelError('x'.repeat(49))).toMatch(/48 characters/);
    expect(signerLabelError('Coldcard MK4')).toBeNull();
  });

  it('uses the standard native-SegWit multisig account path', () => {
    expect(MULTISIG_ACCOUNT_PATH).toBe("m/48'/1'/0'/2'");
  });

  it('accepts the deliberately narrow v1 policy envelope', () => {
    const keys = [
      cosigner(),
      cosigner({ id: 'two', label: 'Ledger', fingerprint: 'b1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-public-regtest-key-2' }),
      cosigner({ id: 'three', label: 'Trezor', fingerprint: 'c1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-public-regtest-key-3' })
    ];
    expect(validatePolicyDraft({ name: 'Family vault', threshold: 2, cosigners: keys })).toEqual([]);
  });

  it('rejects unsafe thresholds, too few keys, and oversized policies', () => {
    expect(validatePolicyDraft({ name: 'Vault', threshold: 1, cosigners: [cosigner(), cosigner({ fingerprint: 'b1b2c3d4' })] })).toContain('At least 2 signatures are required.');
    expect(validatePolicyDraft({ name: 'Vault', threshold: 2, cosigners: [cosigner()] })).toContain('Add at least 3 signers.');
    expect(validatePolicyDraft({ name: 'Vault', threshold: 8, cosigners: Array.from({ length: 8 }, (_, index) => cosigner({ id: String(index), fingerprint: index.toString(16).padStart(8, '0'), xpub: `tpub-key-${index}` })) })).toContain('V1 supports at most 7 signers.');
    const enough = [cosigner(), cosigner({ fingerprint: 'b1b2c3d4', xpub: 'two' }), cosigner({ fingerprint: 'c1b2c3d4', xpub: 'three' })];
    expect(validatePolicyDraft({ name: '', threshold: 4, cosigners: enough })).toEqual(expect.arrayContaining(['A wallet name is required.', 'The threshold cannot exceed the number of signers.']));
    expect(validatePolicyDraft({ name: 'Vault', threshold: 2.5, cosigners: enough })).toContain('At least 2 signatures are required.');
  });

  it('rejects empty labels, malformed fingerprints, and non-BIP48 origins', () => {
    const errors = validatePolicyDraft({ name: 'Vault', threshold: 2, cosigners: [
      cosigner({ label: '' }),
      cosigner({ fingerprint: 'not-hex', xpub: 'two' }),
      cosigner({ fingerprint: 'c1b2c3d4', xpub: 'three', derivationPath: "m/84'/1'/0'" })
    ] });
    expect(errors).toEqual(expect.arrayContaining([
      'Every signer needs a label.',
      'Every master fingerprint must contain 8 hexadecimal characters.',
      `Every v1 key must use ${MULTISIG_ACCOUNT_PATH}.`
    ]));
  });

  it('rejects duplicate fingerprints and duplicate account xpubs', () => {
    const first = cosigner();
    const duplicateFingerprint = cosigner({ id: 'two', label: 'Duplicate fingerprint', xpub: 'tpub-other-key' });
    const duplicateXpub = cosigner({ id: 'three', label: 'Duplicate xpub', fingerprint: 'ffffffff' });
    const errors = validatePolicyDraft({ name: 'Vault', threshold: 2, cosigners: [first, duplicateFingerprint, duplicateXpub] });
    expect(errors).toContain('Every signer must have a unique master fingerprint.');
    expect(errors).toContain('Every signer must have a unique account xpub.');
  });

  it('identifies an existing signer independently of labels and import methods', () => {
    const existing = cosigner({ label: 'BitBox02', fingerprint: 'A1B2C3D4', source: 'usb' });
    expect(findDuplicateCosigner([existing], cosigner({
      label: 'bitbox02_btconly',
      fingerprint: 'a1b2c3d4',
      source: 'file'
    }))).toMatchObject({ cosigner: existing, match: 'both' });
    expect(findDuplicateCosigner([existing], cosigner({
      label: 'Different label',
      fingerprint: 'ffffffff',
      xpub: existing.xpub,
      source: 'manual'
    }))).toMatchObject({ match: 'xpub' });
    expect(findDuplicateCosigner([existing], cosigner({
      label: 'Same fingerprint only',
      xpub: 'tpub-distinct-key',
      source: 'qr'
    }))).toMatchObject({ match: 'fingerprint' });
    expect(findDuplicateCosigner([existing], cosigner({
      label: 'Independent signer',
      fingerprint: 'ffffffff',
      xpub: 'tpub-independent-key',
      source: 'file'
    }))).toBeNull();
  });

  it('bounds wallet names, stable identifiers, and signer labels', () => {
    const base = [
      cosigner({ id: '', label: 'A' }),
      cosigner({ id: 'x'.repeat(129), label: 'B', fingerprint: 'b1b2c3d4', xpub: 'tpub-key-2' }),
      cosigner({ id: 'duplicate', label: 'C', fingerprint: 'c1b2c3d4', xpub: 'tpub-key-3' })
    ];
    expect(validatePolicyDraft({ name: 'x'.repeat(49), threshold: 2, cosigners: base })).toEqual(expect.arrayContaining([
      'The wallet name must be 48 characters or fewer.',
      'Every signer needs a bounded stable identifier.'
    ]));

    const duplicateIds = [
      cosigner({ id: 'same', label: 'x'.repeat(49) }),
      cosigner({ id: 'same', label: 'B', fingerprint: 'b1b2c3d4', xpub: 'tpub-key-2' }),
      cosigner({ id: 'three', label: 'C', fingerprint: 'c1b2c3d4', xpub: 'tpub-key-3' })
    ];
    expect(validatePolicyDraft({ name: 'Vault', threshold: 2, cosigners: duplicateIds })).toEqual(expect.arrayContaining([
      'Every signer must have a unique identifier.',
      'Signer labels must be 48 characters or fewer.'
    ]));
  });

  it('normalizes labels and fingerprints without altering public keys', () => {
    expect(normalizeCosigner(cosigner({ label: '  Office   Coldcard ', fingerprint: 'A1B2C3D4' }))).toMatchObject({
      label: 'Office Coldcard',
      fingerprint: 'a1b2c3d4',
      xpub: 'tpubD6NzVbkrYhZ4Y-public-regtest-key-1'
    });
  });

  it('renders stable fingerprint-sorted receive and change descriptors', () => {
    const keys = [cosigner({ fingerprint: 'ffffffff', xpub: 'last' }), cosigner({ fingerprint: '00000000', xpub: 'first' })];
    expect(descriptorPreview(2, keys)).toBe("wsh(sortedmulti(2,[00000000/48'/1'/0'/2']first/0/*,[ffffffff/48'/1'/0'/2']last/0/*))");
    expect(descriptorPreview(2, keys, 1)).toContain('first/1/*');
  });
});

describe('coordinator signing progress', () => {
  it('reports which devices signed and whether the PSBT can be finalized', () => {
    expect(coordinatorProgress(2, [
      { cosignerId: 'a', status: 'signed' },
      { cosignerId: 'b', status: 'ready' },
      { cosignerId: 'c', status: 'unavailable' }
    ])).toEqual({ signed: 1, required: 2, remaining: 1, canFinalize: false });

    expect(coordinatorProgress(2, [
      { cosignerId: 'a', status: 'signed' },
      { cosignerId: 'b', status: 'signed' },
      { cosignerId: 'c', status: 'ready' }
    ])).toEqual({ signed: 2, required: 2, remaining: 0, canFinalize: true });
  });
});
