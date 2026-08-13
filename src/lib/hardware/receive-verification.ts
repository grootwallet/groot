import { walletErrorCode, type HardwareDevice, type WalletErrorCode } from '$lib/wallet/contracts';

export type ReceiveVerificationIntent = 'prompt_pin' | 'rescan' | 'unavailable' | 'verify';

export type ReceiveVerificationFailure = {
  code: WalletErrorCode | 'internal_error';
  message: string;
};

export function receiveVerificationIntent(device: HardwareDevice): ReceiveVerificationIntent {
  if (device.action === 'prompt_pin') return 'prompt_pin';
  if (device.action === 'retry') return 'rescan';
  if (device.action === 'none') return 'unavailable';
  return 'verify';
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
