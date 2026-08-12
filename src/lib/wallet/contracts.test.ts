import { describe, expect, it } from 'vitest';
import { WalletError, type WalletErrorCode } from './contracts';

const remediationErrorCodes = [
  'invalid_coin',
  'coin_unavailable',
  'invalid_signature'
] as const satisfies readonly WalletErrorCode[];

describe('wallet error contract', () => {
  it('represents the stable remediation error codes without changing them', () => {
    expect(remediationErrorCodes.map((code) => new WalletError(code, 'test').code)).toEqual(
      remediationErrorCodes
    );
  });
});
