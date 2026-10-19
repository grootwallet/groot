import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureMobileViewport } from './mobile-viewport';

afterEach(() => vi.unstubAllGlobals());

describe('native mobile viewport', () => {
  it('leaves browser and desktop zoom untouched', () => {
    expect(configureMobileViewport(false)).toBeUndefined();
  });

  it('blocks pinch while retaining scrolling, and restores the previous viewport on teardown', () => {
    const original = 'width=device-width, initial-scale=1, viewport-fit=cover';
    const viewport = {
      content: original,
      setAttribute(_name: string, value: string) {
        this.content = value;
      }
    };
    const document = Object.assign(new EventTarget(), { querySelector: () => viewport });
    vi.stubGlobal('document', document);
    const restore = configureMobileViewport(true);
    expect(viewport.content).toContain('minimum-scale=1, maximum-scale=1, user-scalable=no');
    expect(viewport.content).toContain('viewport-fit=cover');
    for (const name of ['gesturestart', 'gesturechange']) {
      const pinch = new Event(name, { cancelable: true });
      document.dispatchEvent(pinch);
      expect(pinch.defaultPrevented).toBe(true);
    }
    const scroll = new Event('touchmove', { cancelable: true });
    document.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    restore?.();
    expect(viewport.content).toBe(original);
    const pinch = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(false);
  });
});
