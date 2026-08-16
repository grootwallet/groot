import { describe, expect, it } from 'vitest';
import { mergeHardwareDiscovery } from './discovery';
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
