import { compactAddress } from '$lib/address-display';
import type { RecoveryDrill } from '$lib/wallet/contracts';

export function parseWalletTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWalletTimestamp(value: string): string {
  const date = parseWalletTimestamp(value);
  if (!date) return 'Date unavailable';

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
    timeZoneName: 'short'
  }).format(date);
}

export function recoveryDrillNotice(drill: RecoveryDrill) {
  const matches = drill.matchesCurrentWallet;
  return {
    title: matches ? 'Recovery drill passed' : 'Backup does not match',
    description: compactAddress(drill.firstAddress, 16, 12),
    tone: matches ? 'success' as const : 'danger' as const
  };
}
