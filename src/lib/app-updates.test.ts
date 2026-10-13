import { describe, expect, it } from 'vitest';
import { shouldCheckUpdates, updateErrorCopy, UPDATE_INTERVAL } from './app-updates';
import { releaseNotes } from './release-notes';
import { translate } from './i18n-catalog';
describe('app release preferences and errors', () => {
  it('never contacts GitHub before opt-in and limits automatic attempts to daily', () => {
    expect(shouldCheckUpdates(false, 0, UPDATE_INTERVAL)).toBe(false);
    expect(shouldCheckUpdates(true, 0, 1)).toBe(true);
    expect(shouldCheckUpdates(true, 1, UPDATE_INTERVAL)).toBe(false);
    expect(shouldCheckUpdates(true, 1, UPDATE_INTERVAL + 1)).toBe(true);
    expect(shouldCheckUpdates(true, UPDATE_INTERVAL, 1)).toBe(false);
  });
  it('localizes release notes and every stable native failure without echoing arbitrary errors', () => {
    const errors = [
      'offline',
      'rate_limited',
      'invalid_release',
      'unsupported_platform',
      'trust_unavailable',
      'verification_failed',
      'cancelled',
      'busy',
      'io'
    ];
    for (const source of [...releaseNotes, ...errors.map(updateErrorCopy)]) {
      for (const language of ['fr', 'es'] as const)
        expect(translate(language, source)).not.toBe(source);
    }
    expect(updateErrorCopy('arbitrary backend payload')).not.toContain('arbitrary');
  });
});
