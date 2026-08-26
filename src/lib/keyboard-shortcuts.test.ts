import { describe, expect, it } from 'vitest';
import {
  keyboardShortcuts,
  matchKeyboardShortcut,
  shortcutKeys,
  usesCommandModifier
} from './keyboard-shortcuts';

describe('keyboard shortcuts', () => {
  it('uses the platform-native primary modifier', () => {
    expect(usesCommandModifier('MacIntel')).toBe(true);
    expect(usesCommandModifier('iPhone')).toBe(true);
    expect(usesCommandModifier('Win32')).toBe(false);
    expect(usesCommandModifier('Linux x86_64')).toBe(false);
  });

  it('matches only the documented key and Shift combinations', () => {
    expect(matchKeyboardShortcut({ key: '1', shiftKey: false })?.id).toBe('overview');
    expect(matchKeyboardShortcut({ key: 'r', shiftKey: true })?.id).toBe('receive');
    expect(matchKeyboardShortcut({ key: 'r', shiftKey: false })).toBeUndefined();
    expect(matchKeyboardShortcut({ key: '5', shiftKey: false })).toBeUndefined();
  });

  it('renders the same shortcuts Settings documents', () => {
    const receive = keyboardShortcuts.find(({ id }) => id === 'receive');
    const settings = keyboardShortcuts.find(({ id }) => id === 'settings');
    expect(receive && shortcutKeys(receive, true)).toEqual(['⌘', 'Shift', 'R']);
    expect(settings && shortcutKeys(settings, false)).toEqual(['Ctrl', '4']);
  });
});
