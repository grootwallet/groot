import { describe, expect, it } from 'vitest';
import { DEFAULT_ZOOM, ZOOM_STORAGE_KEY, applyZoom, changeZoom, readPersistedZoom } from './zoom';

describe('bounded app zoom', () => {
  it('defaults invalid values and snaps persisted values to a supported level', () => {
    expect(readPersistedZoom({ getItem: () => null })).toBe(DEFAULT_ZOOM);
    expect(readPersistedZoom({ getItem: () => '10' })).toBe(1.4);
    expect(readPersistedZoom({ getItem: () => '1.17' })).toBe(1.2);
  });

  it('never steps outside the 80 to 140 percent layout-safe range', () => {
    expect(changeZoom(0.8, 'out')).toBe(0.8);
    expect(changeZoom(1, 'in')).toBe(1.1);
    expect(changeZoom(1.4, 'in')).toBe(1.4);
    expect(changeZoom(1.3, 'reset')).toBe(1);
  });

  it('applies and persists only a supported value', () => {
    const writes: Record<string, string> = {};
    const styles: Record<string, string> = {};
    expect(
      applyZoom(
        1.37,
        {
          setItem: (key, value) => {
            writes[key] = value;
          }
        },
        {
          setProperty: (key, value) => {
            styles[key] = String(value);
          }
        }
      )
    ).toBe(1.4);
    expect(writes[ZOOM_STORAGE_KEY]).toBe('1.4');
    expect(styles.zoom).toBe('1.4');
  });
});
