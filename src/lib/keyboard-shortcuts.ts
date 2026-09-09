export type KeyboardShortcut = {
  id:
    | 'overview'
    | 'activity'
    | 'coins'
    | 'settings'
    | 'receive'
    | 'send'
    | 'lock'
    | 'zoom_in'
    | 'zoom_out'
    | 'zoom_reset';
  label:
    | 'Overview'
    | 'Activity'
    | 'Coins'
    | 'Settings'
    | 'Receive'
    | 'Send'
    | 'Lock wallet'
    | 'Zoom in'
    | 'Zoom out'
    | 'Reset zoom';
  key: '1' | '2' | '3' | '4' | 'R' | 'S' | 'L' | '+' | '−' | '0';
  shift?: true;
};

export const keyboardShortcuts: KeyboardShortcut[] = [
  { id: 'overview', label: 'Overview', key: '1' },
  { id: 'activity', label: 'Activity', key: '2' },
  { id: 'coins', label: 'Coins', key: '3' },
  { id: 'settings', label: 'Settings', key: '4' },
  { id: 'receive', label: 'Receive', key: 'R', shift: true },
  { id: 'send', label: 'Send', key: 'S', shift: true },
  { id: 'lock', label: 'Lock wallet', key: 'L' },
  { id: 'zoom_in', label: 'Zoom in', key: '+' },
  { id: 'zoom_out', label: 'Zoom out', key: '−' },
  { id: 'zoom_reset', label: 'Reset zoom', key: '0' }
];

export function usesCommandModifier(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function matchZoomShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code'>
): 'in' | 'out' | 'reset' | undefined {
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 'in';
  if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') return 'out';
  if (event.key === '0' || event.code === 'Numpad0') return 'reset';
  return undefined;
}

export function isDesktopPlatform(
  platform: string,
  userAgent: string,
  maxTouchPoints = 0
): boolean {
  const appleMobileDesktopMode = /Mac/i.test(platform) && maxTouchPoints > 1;
  return (
    !appleMobileDesktopMode && !/Android|iPhone|iPad|iPod|Mobile/i.test(`${platform} ${userAgent}`)
  );
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
