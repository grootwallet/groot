import { describe, expect, it } from 'vitest';
import type { HardwareDevice } from '$lib/wallet/contracts';
import { receiveVerificationFailure, receiveVerificationIntent } from './receive-verification';

const device = (action: HardwareDevice['action']): HardwareDevice => ({
  id: 'fixture-device',
  model: 'Model One',
  label: 'Test signer',
  connected: true,
  status: 'ready',
  action,
  message: 'Fixture status',
  fingerprint: '00000000'
});

describe('receive hardware-verification orchestration', () => {
  it.each([
    ['prompt_pin', 'prompt_pin'],
    ['retry', 'rescan'],
    ['none', 'unavailable'],
    ['import', 'verify'],
    ['confirm_empty_passphrase', 'verify']
  ] as const)('maps %s devices to the %s transition', (action, expected) => {
    expect(receiveVerificationIntent(device(action))).toBe(expected);
  });

  it('normalizes typed and unknown failures without exposing arbitrary values', () => {
    expect(receiveVerificationFailure(
      { code: 'invalid_hardware_pin', message: 'Try again.' },
      'Fallback'
    )).toEqual({ code: 'invalid_hardware_pin', message: 'Try again.' });
    expect(receiveVerificationFailure('hostile value', 'Fallback')).toEqual({
      code: 'internal_error',
      message: 'Fallback'
    });
  });

});
