export const MAX_TRANSFER_BYTES = 256 * 1024;

export function safeTransferFilename(value: string): string {
  const normalized = value.normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return normalized.slice(0, 64) || 'satchel-wallet';
}

export function validateTransferText(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('The transfer file is empty.');
  if (new TextEncoder().encode(normalized).byteLength > MAX_TRANSFER_BYTES) {
    throw new Error('The transfer file is larger than 256 KiB.');
  }
  return normalized;
}

export async function readTransferFile(file: File): Promise<string> {
  if (file.size > MAX_TRANSFER_BYTES) throw new Error('The transfer file is larger than 256 KiB.');
  return validateTransferText(await file.text());
}

export function downloadText(filename: string, value: string): void {
  const blob = new Blob([validateTransferText(value)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
