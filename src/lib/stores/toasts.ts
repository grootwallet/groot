import { writable } from 'svelte/store';

export type ToastAction = { label: string; run: () => void | Promise<void> };
export type Toast = { id: number; title: string; description?: string; tone?: 'default' | 'success' | 'danger'; action?: ToastAction };
export const toasts = writable<Toast[]>([]);
let nextToastId = 0;

export function toast(input: Omit<Toast, 'id'>) {
  const id = ++nextToastId;
  toasts.update((items) => [...items, { ...input, id }]);
  setTimeout(() => toasts.update((items) => items.filter((item) => item.id !== id)), input.action ? 8_000 : 4_200);
}

export function dismissToast(id: number) {
  toasts.update((items) => items.filter((item) => item.id !== id));
}
