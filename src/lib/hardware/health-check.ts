import { policyReadinessKind } from './policy-readiness';
import type { CosignerDraft } from '$lib/multisig/policy';
import type { HardwareDevice } from '$lib/wallet';

export function lockedDeviceForHealthCheck(
  signer: CosignerDraft,
  devices: HardwareDevice[]
): HardwareDevice | null {
  if (policyReadinessKind(signer) !== 'trezor') return null;
  if (
    devices.some((device) => device.fingerprint?.toLowerCase() === signer.fingerprint.toLowerCase())
  ) {
    return null;
  }
  const lockedTrezors = devices.filter(
    (device) => policyReadinessKind(device) === 'trezor' && device.action === 'prompt_pin'
  );
  return lockedTrezors.length === 1 ? lockedTrezors[0] : null;
}

export function matchingDeviceForHealthCheck(
  signer: CosignerDraft,
  devices: HardwareDevice[]
): HardwareDevice | null {
  return (
    devices.find(
      (device) =>
        device.connected && device.fingerprint?.toLowerCase() === signer.fingerprint.toLowerCase()
    ) ?? null
  );
}
