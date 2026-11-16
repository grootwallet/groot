import type { WalletSnapshot } from './contracts';

export type MobileQuickActionSnapshot = Pick<WalletSnapshot, 'syncedAt' | 'utxos'>;

/** Presentation-only readiness derived from a route's already-committed wallet snapshot. */
export function shouldShowMobileSend(snapshot: MobileQuickActionSnapshot): boolean {
  if (!snapshot.syncedAt) return false;
  return snapshot.utxos.some(
    (coin) => !coin.frozen && Number.isSafeInteger(coin.amount) && coin.amount > 0
  );
}
