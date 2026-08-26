export const MAX_TRANSFER_BYTES = 256 * 1024;

export function safeTransferFilename(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized.slice(0, 64) || 'groot-wallet';
}

export function coldcardPolicyFilename(walletName: string): string {
  // Coldcard 5.0.7 derives descriptor-policy names from the filename and
  // rejects non-ASCII names or basenames longer than 20 characters.
  return `${safeTransferFilename(walletName).slice(0, 20)}.txt`;
}

export function psbtFilename(proposalId: string): string {
  // Short ASCII names are easier to identify on small hardware-signer screens
  // and stay compatible with conservative removable-media implementations.
  const identifier =
    proposalId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8) || 'payment';
  return `groot-${identifier}.psbt`;
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
