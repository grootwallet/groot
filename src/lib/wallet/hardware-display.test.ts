import { describe, expect, it } from 'vitest';
import {
  addressForHardwareDisplay,
  hardwareAddressComparison,
  testnetAddressDisplayName
} from './hardware-display';

describe('hardware transaction address display', () => {
  it('uses the Rust-supplied testnet alias for devices that render Regtest as testnet', () => {
    expect(
      addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Ledger Nano S Plus')
    ).toBe('tb1-script-bound-alias');
    expect(
      addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Trezor One')
    ).toBe('tb1-script-bound-alias');
    expect(addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'BitBox02')).toBe(
      'tb1-script-bound-alias'
    );
    expect(
      addressForHardwareDisplay('bcrt1-canonical', 'tb1-script-bound-alias', 'Coldcard MK4')
    ).toBe('bcrt1-canonical');
    expect(addressForHardwareDisplay('bcrt1-canonical', null, 'Ledger Nano S Plus')).toBe(
      'bcrt1-canonical'
    );
  });

  it('keeps Coldcard on the canonical compiled-network address', () => {
    expect(hardwareAddressComparison('tb1-canonical', null, 'Coldcard MK4')).toEqual({
      address: 'tb1-canonical',
      deviceName: null
    });
  });

  it('names the exact device display used in comparison copy', () => {
    expect(testnetAddressDisplayName('ledger_nano_s_plus')).toBe('Ledger Bitcoin Test');
    expect(testnetAddressDisplayName('trezor_1')).toBe('Trezor');
    expect(testnetAddressDisplayName('bitbox02_btconly')).toBe('BitBox02');
    expect(testnetAddressDisplayName('coldcard')).toBeNull();
  });

  it('builds one reusable comparison model for receive and policy review UI', () => {
    expect(
      hardwareAddressComparison('bcrt1-canonical', 'tb1-script-bound-alias', 'bitbox02_btconly')
    ).toEqual({
      address: 'tb1-script-bound-alias',
      deviceName: 'BitBox02'
    });
    expect(hardwareAddressComparison('bcrt1-canonical', null, 'bitbox02_btconly')).toEqual({
      address: 'bcrt1-canonical',
      deviceName: null
    });
  });
});
