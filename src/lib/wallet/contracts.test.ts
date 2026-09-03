import { describe, expect, it } from 'vitest';
import {
  WALLET_ERROR_CODES,
  WalletError,
  walletErrorCode,
  type WalletErrorCode
} from './contracts';

const remediationErrorCodes = [
  'invalid_coin',
  'coin_unavailable',
  'fee_rate_too_low',
  'invalid_signature',
  'invalid_payjoin_uri',
  'invalid_scan_settings',
  'hardware_timeout',
  'hardware_pairing_required',
  'hardware_not_approved',
  'hardware_response_too_large',
  'hardware_command_failed',
  'hardware_io_error',
  'unknown_spending_path',
  'unsupported_wallet_policy'
] as const satisfies readonly WalletErrorCode[];

describe('wallet error contract', () => {
  it('represents the stable remediation error codes without changing them', () => {
    expect(remediationErrorCodes.map((code) => new WalletError(code, 'test').code)).toEqual(
      remediationErrorCodes
    );
  });

  it('maps only allowlisted backend error codes across the IPC boundary', () => {
    expect(walletErrorCode('invalid_credential')).toBe('invalid_credential');
    expect(walletErrorCode('fee_rate_too_low')).toBe('fee_rate_too_low');
    expect(walletErrorCode('hardware_not_approved')).toBe('hardware_not_approved');
    expect(walletErrorCode('unsupported_wallet_policy')).toBe('unsupported_wallet_policy');
    expect(walletErrorCode('attacker_controlled_code')).toBe('internal_error');
    expect(walletErrorCode(null)).toBe('internal_error');
    expect(new Set(WALLET_ERROR_CODES).size).toBe(WALLET_ERROR_CODES.length);
  });
});
