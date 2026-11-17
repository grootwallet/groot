import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { dismissToast, toast, toasts } from '../stores/toasts';

afterEach(() => {
  toasts.set([]);
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe('owned toast lifecycle', () => {
  it('lets a completed flow dismiss its own feedback without clearing another flow’s notification', () => {
    vi.useFakeTimers();
    const wallet = toast({ title: 'Wallet status', tone: 'warning' });
    const market = toast({ title: 'Marketplace status', tone: 'success' });
    expect(wallet).toEqual(expect.any(Number));
    expect(market).toEqual(expect.any(Number));
    dismissToast(market!);
    expect(get(toasts).map((item) => item.id)).toEqual([wallet]);
    vi.advanceTimersByTime(4200);
    expect(get(toasts)).toEqual([]);
  });
  it('does not grant ownership of an existing deduplicated notification', () => {
    vi.useFakeTimers();
    const input = { title: 'Already shown elsewhere' };
    const original = toast(input);
    expect(toast(input)).toBeUndefined();
    expect(get(toasts).map((item) => item.id)).toEqual([original]);
  });
});
