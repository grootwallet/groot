import { describe, expect, it } from 'vitest';
import { validateClipboardText } from './clipboard';

describe('clipboard export policy', () => {
  it('assigns an explicit platform label to each allowed public-data class', () => {
    expect(validateClipboardText('bc1qexample', 'bitcoin-address')).toBe('Bitcoin address');
    expect(validateClipboardText('txid', 'identifier')).toBe('Wallet identifier');
    expect(validateClipboardText('wpkh([00000000/84h/0h/0h]xpub/0/*)', 'public-wallet-data')).toBe(
      'Public wallet data'
    );
    expect(validateClipboardText('cHNidP8=', 'transaction-data')).toBe('Bitcoin transaction data');
  });

  it('rejects empty and oversized clipboard exports', () => {
    expect(() => validateClipboardText('', 'identifier')).toThrow('empty');
    expect(() => validateClipboardText('x'.repeat(129), 'bitcoin-address')).toThrow('safe size');
    expect(() => validateClipboardText('é'.repeat(513), 'identifier')).toThrow('safe size');
    expect(() => validateClipboardText('x'.repeat(256 * 1_024 + 1), 'transaction-data')).toThrow(
      'safe size'
    );
  });
});
