import { writable } from 'svelte/store';

export const DISCREET_MODE_STORAGE_KEY = 'satchel-discreet-mode';
export const discreetMode = writable(false);

export function initDiscreetMode(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage
): boolean {
  const enabled = storage?.getItem(DISCREET_MODE_STORAGE_KEY) === 'true';
  discreetMode.set(enabled);
  return enabled;
}

export function setDiscreetMode(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage
): void {
  discreetMode.set(enabled);
  storage?.setItem(DISCREET_MODE_STORAGE_KEY, String(enabled));
}
