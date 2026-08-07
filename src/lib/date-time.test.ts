import { describe, expect, it } from 'vitest';
import { parseTimestamp, presentLocalTimestamp } from './date-time';

describe('date-time presentation', () => {
  it('parses Rust epoch seconds without first localizing the value', () => {
    expect(parseTimestamp('1786118029')?.toISOString()).toBe('2026-08-07T15:53:49.000Z');
  });

  it('shows a readable local timestamp and exposes the exact timezone and UTC equivalent', () => {
    expect(presentLocalTimestamp('2026-08-07T11:13:49.000Z', 'Europe/Andorra')).toEqual({
      dateTime: '2026-08-07T11:13:49.000Z',
      display: 'August 7, 2026, 1:13:49 PM local time',
      detail: 'Local timezone: Europe/Andorra. UTC: August 7, 2026, 11:13:49 AM UTC.'
    });
  });

  it('preserves human fixture copy that is not a machine timestamp', () => {
    expect(presentLocalTimestamp('Today, 14:20', 'Europe/Andorra')).toEqual({
      dateTime: null,
      display: 'Today, 14:20',
      detail: 'This timestamp was supplied without timezone information.'
    });
  });
});
