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

  it('uses the Rust-supplied Regtest encoding only for Coldcard on Testnet4', () => {
    expect(
      hardwareAddressComparison('tb1-canonical', null, 'Coldcard MK4', 'bcrt1-script-bound-alias')
    ).toEqual({
      address: 'bcrt1-script-bound-alias',
      deviceName: 'Coldcard',
      usesRegtestEncoding: true
    });
    expect(
      addressForHardwareDisplay(
        'tb1-canonical',
        null,
        'Ledger Nano S Plus',
        'bcrt1-script-bound-alias'
      )
    ).toBe('tb1-canonical');
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
      deviceName: 'BitBox02',
      usesRegtestEncoding: false
    });
    expect(hardwareAddressComparison('bcrt1-canonical', null, 'bitbox02_btconly')).toEqual({
      address: 'bcrt1-canonical',
      deviceName: null,
      usesRegtestEncoding: false
    });
  });
});
