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

export type HardwareWalletMembership = 'candidate' | 'compatible' | 'unknown' | 'unrelated';

type ExactHardwareModel = 'trezor_model_one' | 'trezor_safe_3';

function exactHardwareModel(value: {
  label: string;
  deviceType?: string | null;
  model?: string | null;
}): ExactHardwareModel | null {
  const identity = `${value.label} ${value.deviceType ?? ''} ${value.model ?? ''}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '');
  if (identity.includes('trezor1') || identity.includes('trezormodelone')) {
    return 'trezor_model_one';
  }
  if (
    identity.includes('trezorsafe3') ||
    identity.includes('trezort2b1') ||
    identity.includes('trezort3b1')
  ) {
    return 'trezor_safe_3';
  }
  return null;
}

// Discovery is a UI hint, never the full account-key proof performed by Rust.
// A locked device can withhold its fingerprint regardless of its model/name.
export function hardwareWalletMembership(
  device: HardwareDevice,
  fingerprints: readonly string[],
  eligibleDeviceTypes: readonly string[] = [],
  savedSigners: readonly SavedHardwareSignerName[] = []
): HardwareWalletMembership {
  const fingerprint = device.fingerprint?.trim().toLowerCase();
  if (!fingerprint) {
    const deviceKind = hardwareFamily(device);
    const eligibleFingerprintSet = new Set(fingerprints.map((value) => value.trim().toLowerCase()));
    const hasUnboundSigner = savedSigners.some(
      (signer) =>
        (!eligibleFingerprintSet.size ||
          eligibleFingerprintSet.has(signer.fingerprint.trim().toLowerCase())) &&
        !signer.deviceType
    );
    const eligibleKinds = new Set(
      eligibleDeviceTypes.map((deviceType) => hardwareFamily({ label: deviceType, deviceType }))
    );
    if (
      deviceKind !== 'unknown' &&
      eligibleKinds.size > 0 &&
      !eligibleKinds.has(deviceKind) &&
      !hasUnboundSigner
    ) {
      return 'unrelated';
    }
    const deviceModel = exactHardwareModel(device);
    const sameFamilySigners = savedSigners.filter(
      (signer) =>
        (!eligibleFingerprintSet.size ||
          eligibleFingerprintSet.has(signer.fingerprint.trim().toLowerCase())) &&
        hardwareFamily(signer) === deviceKind
    );
    const eligibleModels = sameFamilySigners.map(exactHardwareModel);
    if (
      deviceModel &&
      eligibleModels.length > 0 &&
      eligibleModels.every(Boolean) &&
      !hasUnboundSigner
    ) {
      return eligibleModels.includes(deviceModel) ? 'compatible' : 'unrelated';
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
    : membership === 'compatible'
      ? 'Select to identify'
      : membership === 'unknown'
        ? 'Select to identify'
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
  if (membership === 'compatible' || membership === 'unknown') {
    if (device.action === 'unlock' && device.status === 'detected') return 'Select to identify';
    if (device.action === 'prompt_pin' || device.action === 'unlock') return 'Unlock to identify';
    if (device.action === 'confirm_empty_passphrase') return 'Choose wallet';
    if (
      device.action === 'none' ||
      device.action === 'retry' ||
      device.status === 'not_ready' ||
      device.status === 'needs_companion'
    )
      return 'Attention required';
    return 'Select to identify';
  }
  if (policyUnverified) return 'Policy unverified';
  if (device.action === 'prompt_pin') return 'Locked';
  if (device.action === 'unlock')
    return device.status === 'detected' ? 'Select to identify' : 'Unlock required';
  if (device.action === 'confirm_empty_passphrase') return 'Choose wallet';
  if (device.status === 'ready' || device.status === 'detected') return 'Select to identify';
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
