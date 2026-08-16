import { describe, expect, it } from 'vitest';
import { hardwareDeviceDisplayName, mergeHardwareDiscovery } from './discovery';
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
