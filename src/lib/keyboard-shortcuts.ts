export type KeyboardShortcut = {
  id: 'overview' | 'activity' | 'coins' | 'settings' | 'receive' | 'send';
  label: 'Overview' | 'Activity' | 'Coins' | 'Settings' | 'Receive' | 'Send';
  key: '1' | '2' | '3' | '4' | 'R' | 'S';
  shift?: true;
};

export const keyboardShortcuts: KeyboardShortcut[] = [
  { id: 'overview', label: 'Overview', key: '1' },
  { id: 'activity', label: 'Activity', key: '2' },
  { id: 'coins', label: 'Coins', key: '3' },
  { id: 'settings', label: 'Settings', key: '4' },
  { id: 'receive', label: 'Receive', key: 'R', shift: true },
  { id: 'send', label: 'Send', key: 'S', shift: true }
];

export function usesCommandModifier(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function matchKeyboardShortcut(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey'>
): KeyboardShortcut | undefined {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return keyboardShortcuts.find(
    (shortcut) => shortcut.key.toUpperCase() === key && Boolean(shortcut.shift) === event.shiftKey
  );
}

export function shortcutKeys(shortcut: KeyboardShortcut, commandModifier: boolean): string[] {
  return [commandModifier ? '⌘' : 'Ctrl', ...(shortcut.shift ? ['Shift'] : []), shortcut.key];
}
