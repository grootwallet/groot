import type { HardwareDevice } from '$lib/wallet/contracts';

export type SavedHardwareSignerName = {
  fingerprint: string;
  label: string;
};

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
