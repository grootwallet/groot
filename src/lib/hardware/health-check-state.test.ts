import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import { hardwareHealthChecks, hardwareHealthKey, recordHardwareHealthCheck, setHardwareHealthChecks } from './health-check-state';

describe('hardware health-check state', () => {
  beforeEach(() => hardwareHealthChecks.set({}));

  it('normalizes fingerprints and retains only the latest check', () => {
    recordHardwareHealthCheck(' ABCD1234 ', { status: 'attention', checkedAt: '2026-08-16T06:00:00Z', summary: 'Unlock the signer.' });
    recordHardwareHealthCheck('abcd1234', { status: 'healthy', checkedAt: '2026-08-16T07:00:00Z', summary: 'Signer matches.' });
    expect(hardwareHealthKey(' ABCD1234 ')).toBe('abcd1234');
    expect(get(hardwareHealthChecks)).toEqual({ abcd1234: { status: 'healthy', checkedAt: '2026-08-16T07:00:00Z', summary: 'Signer matches.' } });
  });

  it('hydrates persisted latest checks', () => {
    setHardwareHealthChecks([{ signerFingerprint: 'ABCD1234', status: 'healthy', checkedAt: '2026-08-16T07:00:00Z', summary: 'Signer matches.' }]);
    expect(get(hardwareHealthChecks).abcd1234?.status).toBe('healthy');
  });
});
