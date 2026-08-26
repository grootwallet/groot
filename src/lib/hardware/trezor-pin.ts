import type { HardwareDevice, WalletErrorCode } from '$lib/wallet/contracts';

export const TREZOR_PIN_CELLS = [
  { value: '7', label: 'Top left position' },
  { value: '8', label: 'Top center position' },
  { value: '9', label: 'Top right position' },
  { value: '4', label: 'Middle left position' },
  { value: '5', label: 'Center position' },
  { value: '6', label: 'Middle right position' },
  { value: '1', label: 'Bottom left position' },
  { value: '2', label: 'Bottom center position' },
  { value: '3', label: 'Bottom right position' }
] as const;
export const TREZOR_PIN_MAX_POSITIONS = 50;

export function trezorPinGridAvailable(
  challengeReady: boolean,
  busy: boolean,
  error: string
): boolean {
  return challengeReady && !busy && !error;
}

export function hardwareBrand(device: HardwareDevice | null): string {
  const identity = `${device?.label ?? ''} ${device?.model ?? ''}`.toLowerCase();
  if (identity.includes('trezor')) return 'Trezor';
  if (identity.includes('keepkey')) return 'KeepKey';
  return 'hardware signer';
}

export function trezorPinError(
  code: WalletErrorCode | '',
  fallback: string
): { title: string; detail: string } {
  if (code === 'hardware_pin_rejected') {
    return {
      title: 'PIN not accepted',
      detail:
        'Check the attempts remaining on Trezor. Ask it for a fresh layout, then tap each blank Groot cell by location—not by the digit printed on Trezor.'
    };
  }
  if (code === 'hardware_challenge_expired') {
    return {
      title: 'PIN matrix expired',
      detail: 'Ask Trezor for a fresh layout and complete it within two minutes.'
    };
  }
  if (code === 'hardware_unavailable' || code === 'hardware_io_error') {
    return {
      title: 'Device disconnected',
      detail: 'Reconnect the hardware signer, then ask for a new layout.'
    };
  }
  return {
    title: 'Could not unlock the device',
    detail: fallback || 'Reconnect the hardware signer and start a new PIN matrix.'
  };
}
