import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  DISCREET_MODE_STORAGE_KEY,
  discreetMode,
  initDiscreetMode,
  setDiscreetMode
} from './privacy';

describe('discreet mode preference', () => {
  it('restores only the explicit enabled value', () => {
    expect(initDiscreetMode({ getItem: () => 'true' })).toBe(true);
    expect(get(discreetMode)).toBe(true);
    expect(initDiscreetMode({ getItem: () => 'false' })).toBe(false);
    expect(initDiscreetMode({ getItem: () => null })).toBe(false);
  });

  it('updates the shared state and persists the preference', () => {
    const writes: Array<[string, string]> = [];
    setDiscreetMode(true, { setItem: (key, value) => writes.push([key, value]) });
    expect(get(discreetMode)).toBe(true);
    expect(writes).toEqual([[DISCREET_MODE_STORAGE_KEY, 'true']]);
  });
});
