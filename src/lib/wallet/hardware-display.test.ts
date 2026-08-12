import { describe, expect, it } from 'vitest';
import { addressForHardwareDisplay, testnetAddressDisplayName } from './hardware-display';

describe('hardware transaction address display', () => {
  it('uses the Rust-supplied testnet alias for devices that render Regtest as testnet', () => {
    expect(addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Ledger Nano S Plus')).toBe('tb1-script-bound-alias');
    expect(addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Trezor One')).toBe('tb1-script-bound-alias');
    expect(addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Coldcard MK4')).toBe('bcrt1-canonical');
    expect(addressForHardwareDisplay('bcrt1-canonical', null, 'Ledger Nano S Plus')).toBe('bcrt1-canonical');
  });

  it('names the exact device display used in comparison copy', () => {
    expect(testnetAddressDisplayName('ledger_nano_s_plus')).toBe('Ledger Bitcoin Test');
    expect(testnetAddressDisplayName('trezor_1')).toBe('Trezor');
    expect(testnetAddressDisplayName('coldcard')).toBeNull();
  });
});
