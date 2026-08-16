import { describe, expect, it } from 'vitest';
import {
  MAX_WALLET_PASSPHRASE_BYTES,
  recoveryOrderMatches,
  shuffledRecoveryWords,
  utf8ByteLength
} from './mnemonic-verification';

describe('recovery word verification', () => {
  it('preserves duplicate words as distinct positions while changing display order', () => {
    const words = Array.from({ length: 24 }, (_, index) =>
      index === 20 ? 'same' : `word-${index}`
    );
    words[2] = 'same';
    const shuffled = shuffledRecoveryWords(words);

    expect(shuffled).toHaveLength(24);
    expect(shuffled.map(({ id }) => id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 24 }, (_, index) => index)
    );
    expect(shuffled.map(({ id }) => id)).not.toEqual(
      Array.from({ length: 24 }, (_, index) => index)
    );
    expect(
      shuffled
        .filter(({ word }) => word === 'same')
        .map(({ id }) => id)
        .sort((a, b) => a - b)
    ).toEqual([2, 20]);
  });

  it('accepts only the complete original sequence', () => {
    const words = Array.from({ length: 24 }, (_, id) => ({ id, word: `word-${id}` }));
    expect(recoveryOrderMatches(words, 24)).toBe(true);
    expect(recoveryOrderMatches(words.slice(0, 23), 24)).toBe(false);
    expect(recoveryOrderMatches([words[1], words[0], ...words.slice(2)], 24)).toBe(false);
  });

  it('measures the Rust credential limit in UTF-8 bytes', () => {
    expect(utf8ByteLength('a'.repeat(MAX_WALLET_PASSPHRASE_BYTES))).toBe(
      MAX_WALLET_PASSPHRASE_BYTES
    );
    expect(utf8ByteLength('é')).toBe(2);
  });
});
