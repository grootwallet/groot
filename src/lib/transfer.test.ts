import { describe, expect, it } from 'vitest';
import { coldcardPolicyFilename, MAX_TRANSFER_BYTES, safeTransferFilename, validateTransferText } from './transfer';

describe('air-gapped transfer validation', () => {
  it('normalizes a bounded non-empty payload', () => {
    expect(validateTransferText('  cHNidP8=\n')).toBe('cHNidP8=');
  });

  it('rejects empty and oversized UTF-8 payloads', () => {
    expect(() => validateTransferText(' \n ')).toThrow('empty');
    expect(() => validateTransferText('é'.repeat(MAX_TRANSFER_BYTES))).toThrow('larger');
  });

  it('creates bounded portable filenames without path characters', () => {
    expect(safeTransferFilename(' Family / Vault: été ')).toBe('family-vault-ete');
    expect(safeTransferFilename('///')).toBe('satchel-wallet');
    expect(safeTransferFilename('x'.repeat(100))).toHaveLength(64);
  });

  it('creates a Coldcard-compatible descriptor policy filename', () => {
    expect(coldcardPolicyFilename('Family Vault')).toBe('family-vault.txt');
    expect(coldcardPolicyFilename('Tresorerie familiale ete')).toBe('tresorerie-familiale.txt');
    expect(coldcardPolicyFilename('///')).toBe('satchel-wallet.txt');
    expect(coldcardPolicyFilename('x'.repeat(100)).slice(0, -4)).toHaveLength(20);
  });
});
