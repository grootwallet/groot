import { describe, expect, it } from 'vitest';
import {
  keyboardShortcuts,
  isDesktopPlatform,
  matchKeyboardShortcut,
  matchZoomShortcut,
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

  it('matches standard zoom keys across keyboard layouts', () => {
    expect(matchZoomShortcut({ key: '+', code: 'Equal' })).toBe('in');
    expect(matchZoomShortcut({ key: '=', code: 'Equal' })).toBe('in');
    expect(matchZoomShortcut({ key: '-', code: 'Minus' })).toBe('out');
    expect(matchZoomShortcut({ key: '0', code: 'Digit0' })).toBe('reset');
    expect(matchZoomShortcut({ key: '1', code: 'Digit1' })).toBeUndefined();
  });

  it('keeps the immediate lock shortcut on desktop platforms', () => {
    expect(isDesktopPlatform('MacIntel', 'Mozilla/5.0')).toBe(true);
    expect(isDesktopPlatform('Win32', 'Mozilla/5.0')).toBe(true);
    expect(isDesktopPlatform('iPad', 'Mozilla/5.0')).toBe(false);
    expect(isDesktopPlatform('MacIntel', 'Mozilla/5.0', 5)).toBe(false);
    expect(isDesktopPlatform('Linux armv8l', 'Mozilla/5.0 (Linux; Android 16) Mobile')).toBe(false);
  });

  it('matches only the documented key and Shift combinations', () => {
    expect(matchKeyboardShortcut({ key: '1', shiftKey: false })?.id).toBe('overview');
    expect(matchKeyboardShortcut({ key: 'r', shiftKey: true })?.id).toBe('receive');
    expect(matchKeyboardShortcut({ key: 'r', shiftKey: false })).toBeUndefined();
    expect(matchKeyboardShortcut({ key: 'l', shiftKey: false })?.id).toBe('lock');
    expect(matchKeyboardShortcut({ key: 'l', shiftKey: true })).toBeUndefined();
    expect(matchKeyboardShortcut({ key: '5', shiftKey: false })).toBeUndefined();
  });

  it('renders the same shortcuts Settings documents', () => {
    const receive = keyboardShortcuts.find(({ id }) => id === 'receive');
    const settings = keyboardShortcuts.find(({ id }) => id === 'settings');
    const lock = keyboardShortcuts.find(({ id }) => id === 'lock');
    expect(receive && shortcutKeys(receive, true)).toEqual(['⌘', 'Shift', 'R']);
    expect(settings && shortcutKeys(settings, false)).toEqual(['Ctrl', '4']);
    expect(lock && shortcutKeys(lock, true)).toEqual(['⌘', 'L']);
  });
});
