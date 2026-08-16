import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { externalSignerHealthKey, externalSignerHealthSessions, recordExternalSignerHealthCheck } from './external-signer-health-session';

describe('external signer health session', () => {
  beforeEach(() => externalSignerHealthSessions.set({}));

  it('shares the latest bounded check history by normalized signer fingerprint', () => {
    recordExternalSignerHealthCheck(' AABBCCDD ', { status: 'healthy', checkedAt: '2026-08-16T12:00:00.000Z', summary: 'Matched.' });
    recordExternalSignerHealthCheck('aabbccdd', { status: 'attention', checkedAt: '2026-08-16T12:01:00.000Z', summary: 'Disconnected.' });

    const session = get(externalSignerHealthSessions)[externalSignerHealthKey('AABBCCDD')];
    expect(session.latest.status).toBe('attention');
    expect(session.history.map((entry) => entry.status)).toEqual(['attention', 'healthy']);
  });

  it('keeps at most twenty checks for one signer', () => {
    for (let index = 0; index < 25; index += 1) {
      recordExternalSignerHealthCheck('deadbeef', { status: 'healthy', checkedAt: `2026-08-16T12:${String(index).padStart(2, '0')}:00.000Z`, summary: 'Matched.' });
    }

    expect(get(externalSignerHealthSessions).deadbeef.history).toHaveLength(20);
  });
});
