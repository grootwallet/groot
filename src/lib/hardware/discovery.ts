import type { HardwareDevice } from '$lib/wallet/contracts';

export function mergeHardwareDiscovery(
  previous: HardwareDevice[],
  latest: HardwareDevice[]
): HardwareDevice[] {
  const merged = new Map(previous.map((device) => [device.id, device]));
  for (const device of latest) merged.set(device.id, device);
  return [...merged.values()];
}
