import { describe, expect, it } from 'vitest';
import {
  estimatedFutureTimestamp,
  parseTimestamp,
  presentLocalTimestamp,
  syncAge
} from './date-time';

describe('date-time presentation', () => {
  it('parses Rust epoch seconds without first localizing the value', () => {
    expect(parseTimestamp('1786118029')?.toISOString()).toBe('2026-08-07T15:53:49.000Z');
  });

  it('shows a concise timestamp and exposes full local and UTC details', () => {
    expect(presentLocalTimestamp('2026-08-07T11:13:49.000Z', 'Europe/Andorra')).toEqual({
      dateTime: '2026-08-07T11:13:49.000Z',
      display: 'August 7, 2026, 1:13 PM',
      detail:
        'Local time: August 7, 2026, 1:13:49 PM (Europe/Andorra). UTC: August 7, 2026, 11:13:49 AM UTC.'
    });
  });

  it('preserves human fixture copy that is not a machine timestamp', () => {
    expect(presentLocalTimestamp('Today, 14:20', 'Europe/Andorra')).toEqual({
      dateTime: null,
      display: 'Today, 14:20',
      detail: 'This timestamp was supplied without timezone information.'
    });
  });

  it('reports truthful bounded relative sync ages', () => {
    const now = Date.parse('2026-08-28T15:30:00.000Z');
    expect(syncAge(null, now)).toEqual({ unit: 'never', value: 0 });
    expect(syncAge('2026-08-28T15:29:20.000Z', now)).toEqual({ unit: 'now', value: 0 });
    expect(syncAge('2026-08-28T15:10:00.000Z', now)).toEqual({ unit: 'minute', value: 20 });
    expect(syncAge('2026-08-28T12:00:00.000Z', now)).toEqual({ unit: 'hour', value: 3 });
    expect(syncAge('2026-08-26T12:00:00.000Z', now)).toEqual({ unit: 'day', value: 2 });
    expect(syncAge('not-a-time', now)).toEqual({ unit: 'never', value: 0 });
    expect(syncAge('2026-08-28T15:31:00.000Z', now)).toEqual({ unit: 'now', value: 0 });
  });

  it('derives a display-only availability estimate from the verified observation', () => {
    expect(estimatedFutureTimestamp('1786118029', 600)).toBe('2026-08-07T16:03:49.000Z');
    expect(estimatedFutureTimestamp('2026-10-25T00:55:00.000Z', 600)).toBe(
      '2026-10-25T01:05:00.000Z'
    );
  });

  it('rejects malformed or unbounded availability estimates', () => {
    expect(estimatedFutureTimestamp(null, 600)).toBeNull();
    expect(estimatedFutureTimestamp('not-a-time', 600)).toBeNull();
    expect(estimatedFutureTimestamp('1786118029', null)).toBeNull();
    expect(estimatedFutureTimestamp('1786118029', -1)).toBeNull();
    expect(estimatedFutureTimestamp('1786118029', Number.MAX_VALUE)).toBeNull();
  });
});
