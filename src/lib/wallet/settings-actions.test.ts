import { describe, expect, it } from 'vitest';
import { createSettingsActions } from './settings-actions';

describe('Settings action lifetimes', () => {
  it('replaces only the same action and preserves independent pending work', () => {
    const actions = createSettingsActions(() => 'wallet-a');
    const read = actions.begin('read');
    const save = actions.begin('save');
    const retry = actions.begin('read');
    expect(read()).toBe(false);
    expect(save()).toBe(true);
    expect(retry()).toBe(true);
    actions.invalidate('read');
    expect(retry()).toBe(false);
    expect(save()).toBe(true);
  });

  it('rejects a changed wallet but preserves a rejected selection', () => {
    let selected = 'wallet-a';
    const actions = createSettingsActions(() => selected);
    const pending = actions.begin('save');
    // A failed native selection leaves the confirmed identity unchanged.
    expect(pending()).toBe(true);
    selected = 'wallet-b';
    expect(pending()).toBe(false);
    expect(actions.begin('save')()).toBe(true);
  });

  it('permanently invalidates replies and future attempts after teardown', () => {
    const actions = createSettingsActions(() => 'wallet-a');
    const pending = actions.begin('save');
    actions.dispose();
    expect(pending()).toBe(false);
    expect(actions.begin('save')()).toBe(false);
  });

  it('keeps separate route instances independent', () => {
    const old = createSettingsActions(() => 'wallet-a');
    const next = createSettingsActions(() => 'wallet-a');
    const first = old.begin('save');
    const second = next.begin('save');
    old.dispose();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
