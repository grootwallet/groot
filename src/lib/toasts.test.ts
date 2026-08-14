import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { dismissToast, toast, toasts } from './stores/toasts';

describe('toast notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toasts.set([]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    toasts.set([]);
  });

  it('coalesces an identical non-action notification while it is visible', () => {
    const notification = { title: 'Multisig setup resumed', description: 'Returned to Verify.', tone: 'success' as const };

    toast(notification);
    toast(notification);

    expect(get(toasts)).toHaveLength(1);
  });

  it('allows the same notification again after the visible one is dismissed', () => {
    const notification = { title: 'Multisig setup resumed', description: 'Returned to Verify.', tone: 'success' as const };
    toast(notification);
    dismissToast(get(toasts)[0].id);

    toast(notification);

    expect(get(toasts)).toHaveLength(1);
  });

  it('keeps distinct and actionable notifications independent', () => {
    toast({ title: 'Setup resumed', description: 'Returned to Signers.', tone: 'success' });
    toast({ title: 'Setup resumed', description: 'Returned to Verify.', tone: 'success' });
    toast({ title: 'Backup saved', action: { label: 'Show', run: () => undefined } });
    toast({ title: 'Backup saved', action: { label: 'Show', run: () => undefined } });

    expect(get(toasts)).toHaveLength(4);
  });
});
