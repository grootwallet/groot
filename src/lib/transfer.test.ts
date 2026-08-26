import { describe, expect, it } from 'vitest';
import {
  coldcardPolicyFilename,
  MAX_TRANSFER_BYTES,
  psbtFilename,
  safeTransferFilename,
  validateTransferText
} from './transfer';

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
    expect(safeTransferFilename('///')).toBe('groot-wallet');
    expect(safeTransferFilename('x'.repeat(100))).toHaveLength(64);
  });

  it('creates a Coldcard-compatible descriptor policy filename', () => {
    expect(coldcardPolicyFilename('Family Vault')).toBe('family-vault.txt');
    expect(coldcardPolicyFilename('Tresorerie familiale ete')).toBe('tresorerie-familiale.txt');
    expect(coldcardPolicyFilename('///')).toBe('groot-wallet.txt');
    expect(coldcardPolicyFilename('x'.repeat(100)).slice(0, -4)).toHaveLength(20);
  });

  it('creates short hardware-signer-compatible PSBT filenames', () => {
    expect(psbtFilename('a3c0ee90-7351-4a51-923f-9eea7c86ddb7')).toBe('groot-a3c0ee90.psbt');
    expect(psbtFilename('ABC-123')).toBe('groot-abc123.psbt');
    expect(psbtFilename('---')).toBe('groot-payment.psbt');
    expect(psbtFilename('a3c0ee90-7351-4a51-923f-9eea7c86ddb7').length).toBeLessThanOrEqual(20);
  });
});
