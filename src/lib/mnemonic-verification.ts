export type RecoveryWord = {
  id: number;
  word: string;
};

export const MAX_WALLET_PASSPHRASE_BYTES = 1_024;
export const MIN_NEW_WALLET_PASSPHRASE_CHARACTERS = 16;

export function shuffledRecoveryWords(words: string[]): RecoveryWord[] {
  const result = words.map((word, id) => ({ id, word }));
  // Onboarding fixtures are deterministic so browser tests remain reproducible. The
  // production mnemonic never enters this module; its native sheet shuffles separately.
  let state = 0x51_7c_4e_1d ^ result.length;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function recoveryOrderMatches(selected: RecoveryWord[], wordCount: number): boolean {
  return selected.length === wordCount && selected.every((word, index) => word.id === index);
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function unicodeCharacterLength(value: string): number {
  return Array.from(value).length;
}
