import { writable } from 'svelte/store';

export type Toast = { id: number; title: string; description?: string; tone?: 'default' | 'success' | 'danger' };
export const toasts = writable<Toast[]>([]);
let nextToastId = 0;

export function toast(input: Omit<Toast, 'id'>) {
  const id = ++nextToastId;
  toasts.update((items) => [...items, { ...input, id }]);
  setTimeout(() => toasts.update((items) => items.filter((item) => item.id !== id)), 4200);
}

export function dismissToast(id: number) {
  toasts.update((items) => items.filter((item) => item.id !== id));
}
