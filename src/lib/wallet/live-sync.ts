import type { WalletProfilesPort, WalletSnapshotPort } from './contracts';

export type LiveSyncController = {
  start(): void;
  restart(): void;
  stop(): void;
  runNow(): Promise<void>;
};

type LiveSyncPort = Pick<WalletProfilesPort, 'exists' | 'profiles'> &
  Pick<WalletSnapshotPort, 'sync' | 'cancelSync' | 'syncMultisig'>;

/**
 * Runs one bounded wallet sync at a time. Repeated wake-ups are coalesced so a
 * slow or offline node cannot create an unbounded queue of native commands.
 */
export function createLiveSync(
  wallet: LiveSyncPort,
  intervalMs = 10_000,
  onError: (cause: unknown) => void = () => undefined
): LiveSyncController {
  let enabled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<boolean> | undefined;
  let consecutiveFailures = 0;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    clearTimer();
    const backoff = Math.min(2 ** consecutiveFailures, 30);
    if (enabled) timer = setTimeout(() => void runNow(), intervalMs * backoff);
  };

  const perform = async (): Promise<boolean> => {
    try {
      if (!(await wallet.exists())) return true;
      const registry = await wallet.profiles();
      const selected = registry.wallets.find((profile) => profile.id === registry.selectedWalletId);
      if (!selected) return true;
      if (selected.kind === 'multisig') await wallet.syncMultisig();
      else await wallet.sync();
      return true;
    } catch (cause) {
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        ['sync_cancelled', 'scan_in_progress', 'initial_scan_required'].includes(String(cause.code))
      ) {
        return true;
      }
      try {
        onError(cause);
      } catch {
        /* Error reporting must never disable future wallet syncs. */
      }
      return false;
    }
  };

  const runNow = async (): Promise<void> => {
    if (!enabled) return;
    clearTimer();
    if (active) {
      await active;
      return;
    }
    const pending = perform();
    active = pending;
    try {
      consecutiveFailures = (await pending) ? 0 : consecutiveFailures + 1;
    } finally {
      if (active === pending) active = undefined;
      if (enabled) schedule();
    }
  };

  return {
    start() {
      if (enabled) return;
      enabled = true;
      // Let the mounted route read its persisted snapshot before network work
      // can take the serialized wallet-operation lock.
      if (!active) schedule();
    },
    restart() {
      enabled = true;
      consecutiveFailures = 0;
      clearTimer();
      // A selection change cancels the previous sync. Once it drains, wait for
      // the normal interval so the target wallet can paint cached state first.
      if (!active) schedule();
    },
    stop() {
      enabled = false;
      clearTimer();
      if (active) void wallet.cancelSync().catch(() => undefined);
    },
    runNow
  };
}
