import { describe, expect, it } from 'vitest';
import { combineDescriptorBranches, descriptorChecksum } from './descriptors';

describe('descriptor interoperability helpers', () => {
  it('computes the Bitcoin Core descriptor checksum', () => {
    expect(descriptorChecksum('raw(deadbeef)')).toBe('89f8spxm');
    expect(descriptorChecksum('')).toBe('7h0w2xvg');
    expect(descriptorChecksum('\u0000')).toBeNull();
  });

  it('combines matching receive and change branches as a standard multipath descriptor', () => {
    const receive = "wpkh([d34db33f/84'/1'/0']tpub-test/0/*)#ignored";
    const change = "wpkh([d34db33f/84'/1'/0']tpub-test/1/*)#ignored";
    expect(combineDescriptorBranches(receive, change)).toMatch(/^wpkh\(.+\/<0;1>\/\*\)#[a-z0-9]{8}$/);
  });

  it('refuses to merge branches whose policy differs', () => {
    expect(combineDescriptorBranches('wpkh(tpub/0/*)', 'wpkh(other/1/*)')).toBeNull();
    expect(combineDescriptorBranches('wpkh(tpub/*)', 'wpkh(tpub/*)')).toBeNull();
    expect(combineDescriptorBranches('wpkh(tpub\u0000/0/*)', 'wpkh(tpub\u0000/1/*)')).toBeNull();
  });
});
