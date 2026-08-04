import { writeText as writeTauriText } from '@tauri-apps/plugin-clipboard-manager';

export async function copyText(value: string): Promise<void> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    await writeTauriText(value, { label: 'Bitcoin address' });
    return;
  }
  await navigator.clipboard.writeText(value);
}
