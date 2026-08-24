import { walletErrorCode, type HardwareDevice, type WalletErrorCode } from '$lib/wallet/contracts';

export type ReceiveVerificationIntent = 'prompt_pin' | 'unlock' | 'unavailable' | 'verify';

export type ReceiveVerificationFailure = {
  code: WalletErrorCode | 'internal_error';
  message: string;
};

export function receiveVerificationIntent(device: HardwareDevice): ReceiveVerificationIntent {
  if (device.action === 'prompt_pin') return 'prompt_pin';
  if (device.action === 'unlock') return 'unlock';
  if (device.action === 'retry') return 'unavailable';
  if (device.action === 'none') return 'unavailable';
  return 'verify';
}

export function hasAmbiguousUnidentifiedHardware(devices: HardwareDevice[]): boolean {
  const counts = new Map<string, number>();
  for (const device of devices) {
    if (device.fingerprint !== null) continue;
    const family = device.model.trim().toLowerCase();
    const count = (counts.get(family) ?? 0) + 1;
    if (count > 1) return true;
    counts.set(family, count);
  }
  return false;
}

export function receiveVerificationFailure(
  cause: unknown,
  fallback: string
): ReceiveVerificationFailure {
  if (cause && typeof cause === 'object') {
    const error = cause as { code?: unknown; message?: unknown };
    return {
      code: walletErrorCode(error.code),
      message: typeof error.message === 'string' ? error.message : fallback
    };
  }
  return { code: 'internal_error', message: fallback };
}
