import { describe, expect, it } from 'vitest';
import { lockedDeviceForHealthCheck } from './health-check';
import type { CosignerDraft } from '$lib/multisig/policy';
import type { HardwareDevice } from '$lib/wallet';

const signer: CosignerDraft = {
  id: 'trezor-one',
  label: 'Trezor One',
  fingerprint: '3031c299',
  xpub: 'tpub-public-only',
  derivationPath: "m/48'/1'/0'/2'",
  source: 'usb',
  deviceType: 'trezor'
};

const locked: HardwareDevice = {
  id: 'locked-trezor',
  label: 'Trezor One',
  model: 'trezor_1',
  fingerprint: null,
  connected: true,
  status: 'needs_pin',
  message: 'Unlock with the PIN matrix.',
  action: 'prompt_pin'
};

describe('health-check hardware selection', () => {
  it('selects the only locked Trezor when its fingerprint is unavailable', () => {
    expect(lockedDeviceForHealthCheck(signer, [locked])).toEqual(locked);
  });

  it('does not guess when another device already exposes the saved fingerprint', () => {
    expect(lockedDeviceForHealthCheck(signer, [locked, { ...locked, id: 'ready', fingerprint: '3031c299', status: 'ready', action: 'import' }])).toBeNull();
  });

  it('does not guess between multiple locked Trezors', () => {
    expect(lockedDeviceForHealthCheck(signer, [locked, { ...locked, id: 'other' }])).toBeNull();
  });
});
