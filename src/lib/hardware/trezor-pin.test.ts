import { describe, expect, it } from 'vitest';
import type { HardwareDevice } from '$lib/wallet/contracts';
import { hardwareBrand, TREZOR_PIN_CELLS, TREZOR_PIN_MAX_POSITIONS, trezorPinError } from './trezor-pin';

function device(label: string, model: string): HardwareDevice {
  return { id: 'id', label, model, fingerprint: null, connected: true, status: 'needs_pin', message: '', action: 'prompt_pin' };
}

describe('Trezor PIN presentation', () => {
  it('normalizes transport labels to a human device brand', () => {
    expect(hardwareBrand(device('trezor_1', 'trezor_1'))).toBe('Trezor');
    expect(hardwareBrand(device('KeepKey #1', 'keepkey'))).toBe('KeepKey');
    expect(hardwareBrand(device('Unknown', 'hid'))).toBe('hardware wallet');
    expect(hardwareBrand(null)).toBe('hardware wallet');
  });

  it('keeps HWI position values in spatial numpad order without using them as labels', () => {
    expect(TREZOR_PIN_CELLS.map((cell) => cell.value)).toEqual(['7', '8', '9', '4', '5', '6', '1', '2', '3']);
    expect(new Set(TREZOR_PIN_CELLS.map((cell) => cell.value)).size).toBe(9);
    expect(TREZOR_PIN_CELLS.every((cell) => !cell.label.includes(cell.value))).toBe(true);
    expect(TREZOR_PIN_MAX_POSITIONS).toBe(50);
  });

  it('turns stable PIN errors into actionable, non-technical guidance', () => {
    expect(trezorPinError('hardware_pin_rejected', 'raw')).toEqual({
      title: 'PIN not accepted',
      detail: 'Check the attempts remaining on Trezor. Ask it for a fresh layout, then tap each blank Satchel cell by location—not by the digit printed on Trezor.'
    });
    expect(trezorPinError('hardware_challenge_expired', 'raw').title).toBe('PIN matrix expired');
    expect(trezorPinError('internal_error', 'USB unavailable').detail).toBe('USB unavailable');
    expect(trezorPinError('', '').detail).toBe('Reconnect the hardware wallet and start a new PIN matrix.');
  });
});
