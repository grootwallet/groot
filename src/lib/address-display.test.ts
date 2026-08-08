import { describe, expect, it } from 'vitest';
import { compactAddress, groupAddressForDisplay } from './address-display';

describe('readable address display', () => {
  it.each([
    'bcrt1q5spdlkwvajjz9t0nvsqygmeaagxts4sqxy3a7t',
    'bcrt1q963drekt8pyq3p7ml227xlc84jh23hhye953plqgk8gvheuuc0fs7f5uxl'
  ])('groups %s without changing or inserting characters', (address) => {
    const groups = groupAddressForDisplay(address);
    expect(groups.join('')).toBe(address);
    expect(groups.every((group) => group.length >= 3 && group.length <= 4)).toBe(true);
    expect(groups.some((group) => group.includes(' '))).toBe(false);
  });

  it('handles empty and short values without inventing content', () => {
    expect(groupAddressForDisplay('')).toEqual([]);
    expect(groupAddressForDisplay('bc1')).toEqual(['bc1']);
  });
});

describe('compactAddress', () => {
  it('preserves both identifying ends of a long address', () => {
    const address = 'bcrt1qmgtr92k8dw0cgqw445kgc8p54dz8azvan7hd93xdk4789a6dvylq8uvjuj';
    expect(compactAddress(address)).toBe('bcrt1qmgtr92…lq8uvjuj');
  });

  it('does not alter short values', () => {
    expect(compactAddress('bcrt1qshort')).toBe('bcrt1qshort');
  });
});
