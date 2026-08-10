import { describe, expect, it } from 'vitest';
import { addressForHardwareDisplay } from './hardware-display';

describe('hardware transaction address display', () => {
  it('uses the Rust-supplied testnet alias only for Ledger', () => {
    expect(addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Ledger Nano S Plus')).toBe('tb1-script-bound-alias');
    expect(addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Coldcard MK4')).toBe('bcrt1-canonical');
    expect(addressForHardwareDisplay('bcrt1-canonical', null, 'Ledger Nano S Plus')).toBe('bcrt1-canonical');
  });
});
