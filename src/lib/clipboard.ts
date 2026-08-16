import { writeText as writeTauriText } from '@tauri-apps/plugin-clipboard-manager';

export type ClipboardContent =
  'bitcoin-address' | 'identifier' | 'public-wallet-data' | 'transaction-data';

const clipboardPolicy: Record<ClipboardContent, { label: string; maxBytes: number }> = {
  'bitcoin-address': { label: 'Bitcoin address', maxBytes: 128 },
  identifier: { label: 'Wallet identifier', maxBytes: 1_024 },
  'public-wallet-data': { label: 'Public wallet data', maxBytes: 256 * 1_024 },
  'transaction-data': { label: 'Bitcoin transaction data', maxBytes: 256 * 1_024 }
};

export function validateClipboardText(value: string, content: ClipboardContent): string {
  const encodedLength = new TextEncoder().encode(value).byteLength;
  if (encodedLength === 0) throw new Error('Clipboard content is empty.');
  if (encodedLength > clipboardPolicy[content].maxBytes) {
    throw new Error('Clipboard content exceeds the safe size limit.');
  }
  return clipboardPolicy[content].label;
}

export async function copyText(value: string, content: ClipboardContent): Promise<void> {
  const label = validateClipboardText(value, content);
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    await writeTauriText(value, { label });
    return;
  }
  await navigator.clipboard.writeText(value);
}
