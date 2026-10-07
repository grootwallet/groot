import { describe, expect, it } from 'vitest';
import {
  hardwareDeviceDisplayName,
  hardwareDeviceStateLabel,
  hardwareWalletMembership,
  hardwareWalletMembershipLabel,
  mergeHardwareDiscovery
} from './discovery';
import type { HardwareDevice } from '$lib/wallet/contracts';

function device(id: string, message = id): HardwareDevice {
  return {
    id,
    label: id,
    model: id,
    fingerprint: null,
    connected: true,
    status: 'ready',
    action: 'import',
    message
  };
}

describe('hardware discovery settling', () => {
  it('keeps devices seen by either bounded scan and refreshes repeated records', () => {
    expect(
      mergeHardwareDiscovery(
        [device('bitbox')],
        [device('bitbox', 'ready now'), device('coldcard')]
      )
    ).toEqual([device('bitbox', 'ready now'), device('coldcard')]);
  });

  it('does not duplicate a device returned by both scans', () => {
    expect(mergeHardwareDiscovery([device('ledger')], [device('ledger')])).toHaveLength(1);
  });
});

describe('hardware device display names', () => {
  it('keeps matching signer copy quiet unless policy evidence is missing', () => {
    expect(hardwareWalletMembershipLabel('candidate')).toBe('');
    expect(hardwareWalletMembershipLabel('candidate', true)).toBe('Policy unverified');
    expect(hardwareWalletMembershipLabel('unknown', true)).toBe('Select to identify');
    expect(hardwareWalletMembershipLabel('compatible')).toBe('Select to identify');
    expect(hardwareWalletMembershipLabel('unrelated', true)).toBe('Not part of this wallet');
  });
  it('keeps each compact state honest about wallet membership', () => {
    expect(hardwareDeviceStateLabel(device('trezor'), 'unknown')).toBe('Select to identify');
    expect(
      hardwareDeviceStateLabel(
        { ...device('trezor'), action: 'prompt_pin', status: 'needs_pin' },
        'unknown'
      )
    ).toBe('Unlock to identify');
    expect(hardwareDeviceStateLabel(device('safe3'), 'unrelated')).toBe('Not part of this wallet');
    expect(hardwareDeviceStateLabel(device('model-one'), 'candidate')).toBe('Select to identify');
  });
  it('never treats a locked device family as proof of wallet membership', () => {
    expect(hardwareWalletMembership(device('trezor'), ['aabbccdd'])).toBe('unknown');
    expect(
      hardwareWalletMembership({ ...device('trezor'), fingerprint: '11223344' }, ['aabbccdd'])
    ).toBe('unrelated');
    expect(
      hardwareWalletMembership({ ...device('trezor'), fingerprint: 'AABBCCDD' }, ['aabbccdd'])
    ).toBe('candidate');
    expect(hardwareWalletMembership({ ...device('ledger'), fingerprint: '11223344' }, [])).toBe(
      'unrelated'
    );
  });
  it('disables a locked device from an unrelated family without prompting it', () => {
    expect(hardwareWalletMembership(device('trezor'), ['aabbccdd'], ['bitbox02'])).toBe(
      'unrelated'
    );
    expect(hardwareWalletMembership(device('jade'), ['aabbccdd'], ['ledger'])).toBe('unrelated');
    expect(hardwareWalletMembership(device('trezor'), ['aabbccdd'], ['trezor'])).toBe('unknown');
    expect(hardwareWalletMembership(device('bitbox02_nova'), ['aabbccdd'], ['bitbox02'])).toBe(
      'unknown'
    );
  });
  it('keeps a fingerprintless approved device selectable when a saved public key has no device type', () => {
    const manual = { fingerprint: 'aabbccdd', label: 'Imported signer', deviceType: null };
    expect(hardwareWalletMembership(device('jade'), ['aabbccdd'], ['trezor'], [manual])).toBe(
      'unknown'
    );
  });
  it('distinguishes exact Trezor models before interactive identity proof', () => {
    const savedSafe3 = [{ fingerprint: 'aabbccdd', label: 'Trezor Safe 3', deviceType: 'trezor' }];
    expect(
      hardwareWalletMembership(
        { ...device('model-one'), label: 'Trezor Model One', model: 'trezor' },
        ['aabbccdd'],
        ['trezor'],
        savedSafe3
      )
    ).toBe('unrelated');
    expect(
      hardwareWalletMembership(
        { ...device('safe-3'), label: 'Trezor Safe 3', model: 'trezor' },
        ['aabbccdd'],
        ['trezor'],
        savedSafe3
      )
    ).toBe('compatible');
    expect(hardwareDeviceStateLabel(device('safe-3'), 'compatible')).toBe('Select to identify');
    expect(
      hardwareWalletMembership(
        { ...device('model-one'), label: 'Trezor Model One', model: 'trezor' },
        ['aabbccdd', '11223344'],
        ['trezor'],
        [...savedSafe3, { fingerprint: '11223344', label: 'Alice', deviceType: 'trezor' }]
      )
    ).toBe('unknown');
  });
  it.each([
    'Coldcard Mk4',
    'Blockstream Jade',
    'BitBox02 Bitcoin-only',
    'BitBox02 Nova Bitcoin-only',
    'Trezor Model One',
    'Trezor Safe 3',
    'Ledger Nano S Plus'
  ])('uses the same unproven identity states for %s', (model) => {
    const connected = { ...device(model), label: model };
    expect(hardwareDeviceStateLabel(connected, 'unknown')).toBe('Select to identify');
    expect(hardwareDeviceStateLabel(connected, 'compatible')).toBe('Select to identify');
    expect(hardwareDeviceStateLabel(connected, 'candidate')).toBe('Select to identify');
    expect(hardwareDeviceStateLabel(connected, 'unrelated')).toBe('Not part of this wallet');
    const locked = {
      ...connected,
      action: 'unlock' as const,
      status: 'needs_device_unlock' as const
    };
    expect(hardwareDeviceStateLabel(locked, 'unknown')).toBe('Unlock to identify');
    expect(hardwareDeviceStateLabel(locked, 'compatible')).toBe('Unlock to identify');
    const passivelyDetected = { ...locked, status: 'detected' as const };
    expect(hardwareDeviceStateLabel(passivelyDetected, 'unknown')).toBe('Select to identify');
    expect(hardwareDeviceStateLabel(passivelyDetected, 'compatible')).toBe('Select to identify');
    expect(hardwareDeviceStateLabel(passivelyDetected, 'candidate')).toBe('Select to identify');
    const unavailable = { ...connected, action: 'none' as const, status: 'not_ready' as const };
    expect(hardwareDeviceStateLabel(unavailable, 'unknown')).toBe('Attention required');
    expect(hardwareDeviceStateLabel(unavailable, 'compatible')).toBe('Attention required');
  });
  it('uses the saved user name after an exact fingerprint match', () => {
    const jade = { ...device('jade'), fingerprint: '1B9B9B49', label: 'jade' };
    expect(
      hardwareDeviceDisplayName(jade, [{ fingerprint: '1b9b9b49', label: 'Blockstream Jade' }])
    ).toBe('Blockstream Jade');
  });

  it('keeps the factory name for locked and unmatched devices', () => {
    expect(
      hardwareDeviceDisplayName(device('locked-jade'), [
        { fingerprint: '1b9b9b49', label: 'Blockstream Jade' }
      ])
    ).toBe('locked-jade');
    expect(
      hardwareDeviceDisplayName({ ...device('foreign'), fingerprint: 'ffffffff', label: 'jade' }, [
        { fingerprint: '1b9b9b49', label: 'Blockstream Jade' }
      ])
    ).toBe('jade');
  });
});
