import { describe, expect, it } from 'vitest';
import type { HardwareDevice } from '$lib/wallet/contracts';
import {
  hasAmbiguousUnidentifiedHardware,
  receiveVerificationFailure,
  receiveVerificationIntent
} from './receive-verification';

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
    ['unlock', 'unlock'],
    ['retry', 'unavailable'],
    ['none', 'unavailable'],
    ['import', 'verify'],
    ['confirm_empty_passphrase', 'verify']
  ] as const)('maps %s devices to the %s transition', (action, expected) => {
    expect(receiveVerificationIntent(device(action))).toBe(expected);
  });

  it('normalizes typed and unknown failures without exposing arbitrary values', () => {
    expect(
      receiveVerificationFailure(
        { code: 'hardware_pin_rejected', message: 'Try again.' },
        'Fallback'
      )
    ).toEqual({ code: 'hardware_pin_rejected', message: 'Try again.' });
    expect(
      receiveVerificationFailure(
        { code: 'attacker_controlled_code', message: 'Untrusted failure.' },
        'Fallback'
      )
    ).toEqual({ code: 'internal_error', message: 'Untrusted failure.' });
    expect(receiveVerificationFailure('hostile value', 'Fallback')).toEqual({
      code: 'internal_error',
      message: 'Fallback'
    });
  });

  it('fails only duplicate unidentified paths from the same device family', () => {
    const lockedJade = { ...device('unlock'), fingerprint: null, model: 'jade' };
    const lockedLedger = { ...device('unlock'), fingerprint: null, model: 'ledger' };
    expect(hasAmbiguousUnidentifiedHardware([lockedJade, lockedLedger])).toBe(false);
    expect(
      hasAmbiguousUnidentifiedHardware([lockedJade, { ...lockedJade, id: 'second-jade' }])
    ).toBe(true);
  });
});
