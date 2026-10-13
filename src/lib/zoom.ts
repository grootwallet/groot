import { writable } from 'svelte/store';

export const ZOOM_STORAGE_KEY = 'groot-ui-zoom';
export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4] as const;
export const DEFAULT_ZOOM = 1;

export const zoomLevel = writable<number>(DEFAULT_ZOOM);

function supportedZoom(value: number): number {
  return ZOOM_LEVELS.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest
  );
}

export function readPersistedZoom(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
): number {
  const raw = storage?.getItem(ZOOM_STORAGE_KEY);
  if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_ZOOM;
  const stored = Number(raw);
  return Number.isFinite(stored) ? supportedZoom(stored) : DEFAULT_ZOOM;
}

export function applyZoom(
  next: number,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage,
  root: Pick<CSSStyleDeclaration, 'setProperty'> | undefined = typeof document === 'undefined'
    ? undefined
    : document.documentElement.style
): number {
  const value = supportedZoom(next);
  zoomLevel.set(value);
  root?.setProperty('zoom', String(value));
  storage?.setItem(ZOOM_STORAGE_KEY, String(value));
  return value;
}

export function initZoom(): number {
  return applyZoom(readPersistedZoom());
}

export function changeZoom(current: number, direction: 'in' | 'out' | 'reset'): number {
  if (direction === 'reset') return DEFAULT_ZOOM;
  const index = ZOOM_LEVELS.indexOf(supportedZoom(current) as (typeof ZOOM_LEVELS)[number]);
  const nextIndex = Math.max(
    0,
    Math.min(ZOOM_LEVELS.length - 1, index + (direction === 'in' ? 1 : -1))
  );
  return ZOOM_LEVELS[nextIndex];
}
