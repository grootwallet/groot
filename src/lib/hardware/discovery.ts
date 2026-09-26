import type { HardwareDevice } from '$lib/wallet/contracts';

export type SavedHardwareSignerName = {
  fingerprint: string;
  label: string;
};

// Discovery is a UI hint, never the full account-key proof performed by Rust.
// A locked device can withhold its fingerprint regardless of its model/name.
export function hardwareWalletMembership(
  device: HardwareDevice,
  fingerprints: readonly string[]
): 'candidate' | 'unknown' | 'unrelated' {
  const fingerprint = device.fingerprint?.trim().toLowerCase();
  if (!fingerprint) return 'unknown';
  return fingerprints.some((value) => value.trim().toLowerCase() === fingerprint)
    ? 'candidate'
    : 'unrelated';
}

export function hardwareWalletMembershipLabel(
  membership: ReturnType<typeof hardwareWalletMembership>
) {
  return membership === 'unrelated'
    ? 'Not part of this wallet'
    : membership === 'unknown'
      ? 'Wallet membership unknown · unlock to identify'
      : 'Wallet key candidate · account checked before use';
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
