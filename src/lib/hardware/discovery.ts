import type { HardwareDevice } from '$lib/wallet/contracts';
import { policyReadinessKind } from '$lib/hardware/policy-readiness';

function hardwareFamily(value: Parameters<typeof policyReadinessKind>[0]) {
  const kind = policyReadinessKind(value);
  return kind === 'bitbox_nova' ? 'bitbox02' : kind;
}

export type SavedHardwareSignerName = {
  fingerprint: string;
  label: string;
  deviceType?: string | null;
};

export type HardwareWalletMembership = 'candidate' | 'unknown' | 'unrelated';

// Discovery is a UI hint, never the full account-key proof performed by Rust.
// A locked device can withhold its fingerprint regardless of its model/name.
export function hardwareWalletMembership(
  device: HardwareDevice,
  fingerprints: readonly string[],
  eligibleDeviceTypes: readonly string[] = []
): HardwareWalletMembership {
  const fingerprint = device.fingerprint?.trim().toLowerCase();
  if (!fingerprint) {
    const deviceKind = hardwareFamily(device);
    const eligibleKinds = new Set(
      eligibleDeviceTypes.map((deviceType) => hardwareFamily({ label: deviceType, deviceType }))
    );
    if (deviceKind !== 'unknown' && eligibleKinds.size > 0 && !eligibleKinds.has(deviceKind)) {
      return 'unrelated';
    }
    return 'unknown';
  }
  return fingerprints.some((value) => value.trim().toLowerCase() === fingerprint)
    ? 'candidate'
    : 'unrelated';
}

export function hardwareWalletMembershipLabel(
  membership: ReturnType<typeof hardwareWalletMembership>,
  policyUnverified = false
) {
  return membership === 'unrelated'
    ? 'Not part of this wallet'
    : membership === 'unknown'
      ? 'Wallet match unknown'
      : policyUnverified
        ? 'Policy unverified'
        : '';
}

export function hardwareDeviceStateLabel(
  device: HardwareDevice,
  membership: HardwareWalletMembership,
  policyUnverified = false
): string {
  if (membership === 'unrelated') return 'Not part of this wallet';
  if (membership === 'unknown') {
    return device.action === 'prompt_pin'
      ? 'Locked · wallet match unknown'
      : 'Wallet match unknown';
  }
  if (policyUnverified) return 'Policy unverified';
  if (device.action === 'prompt_pin') return 'Locked';
  if (device.action === 'unlock') return 'Unlock required';
  if (device.action === 'confirm_empty_passphrase') return 'Choose wallet';
  if (device.status === 'ready' || device.status === 'detected') return 'Ready for this wallet';
  return 'Attention required';
}

export function hardwareDeviceDisplayName(
  device: HardwareDevice,
  savedSigners: readonly SavedHardwareSignerName[]
): string {
  const fingerprint = device.fingerprint?.trim().toLowerCase();
  if (!fingerprint) return device.label;
  return (
    savedSigners.find((signer) => signer.fingerprint.trim().toLowerCase() === fingerprint)?.label ??
    device.label
  );
}

export function mergeHardwareDiscovery(
  previous: HardwareDevice[],
  latest: HardwareDevice[]
): HardwareDevice[] {
  const merged = new Map(previous.map((device) => [device.id, device]));
  for (const device of latest) merged.set(device.id, device);
  return [...merged.values()];
}
