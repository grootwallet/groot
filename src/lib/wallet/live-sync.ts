import type { WalletProfile, WalletSnapshotPort, WalletSyncStatus } from './contracts';

export type LiveSyncController = {
  start(): void;
  restart(): void;
  stop(): void;
  stopAndWait(): Promise<void>;
  runNow(): Promise<void>;
};

type LiveSyncPort = Pick<WalletSnapshotPort, 'sync' | 'cancelSync' | 'syncMultisig'> & {
  syncStatus?: () => Promise<WalletSyncStatus | null>;
};

export function isWalletSyncActive(status: WalletSyncStatus | null): boolean {
  return Boolean(
    status &&
    ['connecting', 'syncing', 'checking_pending', 'checking_matches', 'applying'].includes(
      status.state
    )
  );
}

/**
 * Runs one bounded wallet sync at a time. Repeated wake-ups are coalesced so a
 * slow or offline node cannot create an unbounded queue of native commands.
 */
export function createLiveSync(
  wallet: LiveSyncPort,
  selectedWalletKind: () => WalletProfile['kind'] | null,
  intervalMs = 10_000,
  onError: (cause: unknown) => void = () => undefined
): LiveSyncController {
  let enabled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<boolean> | undefined;
  let consecutiveFailures = 0;
  let generation = 0;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    clearTimer();
    const backoff = Math.min(2 ** consecutiveFailures, 30);
    if (enabled) timer = setTimeout(() => void runNow(), intervalMs * backoff);
  };

  const perform = async (startedGeneration: number): Promise<boolean> => {
    try {
      const kind = selectedWalletKind();
      if (!kind) return true;
      // A route-owned refresh survives read-only navigation. Observe that
      // native single-flight operation instead of repeatedly invoking a second
      // sync and filling diagnostics with expected sync_in_progress failures.
      if (wallet.syncStatus) {
        try {
          if (isWalletSyncActive(await wallet.syncStatus())) return true;
        } catch {
          // The sync call remains authoritative when status polling is unavailable.
        }
      }
      if (kind === 'multisig') await wallet.syncMultisig(true);
      else await wallet.sync(true);
      return true;
    } catch (cause) {
      if (!enabled || startedGeneration !== generation) return true;
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        [
          'sync_cancelled',
          'sync_in_progress',
          'scan_in_progress',
          'initial_scan_required'
        ].includes(String(cause.code))
      ) {
        return true;
      }
      // A Mainnet wallet cannot read chain state until the saved Core endpoint
      // passes its exact-chain preflight. Repeating the gated sync every few
      // seconds cannot repair an offline node; the Overview retry performs the
      // preflight when the user is ready to try again.
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        cause.code === 'node_admission_required'
      ) {
        consecutiveFailures = Math.max(consecutiveFailures, 4);
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
    const startedGeneration = generation;
    const pending = perform(startedGeneration);
    active = pending;
    try {
      const succeeded = await pending;
      if (startedGeneration === generation)
        consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
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
      generation += 1;
      enabled = true;
      consecutiveFailures = 0;
      clearTimer();
      // A selection change cancels the previous sync. Once it drains, wait for
      // the normal interval so the target wallet can paint cached state first.
      if (!active) schedule();
    },
    stop() {
      generation += 1;
      enabled = false;
      clearTimer();
      if (active) void wallet.cancelSync().catch(() => undefined);
    },
    async stopAndWait() {
      generation += 1;
      enabled = false;
      clearTimer();
      const pending = active;
      if (!pending) return;
      await wallet.cancelSync().catch(() => undefined);
      await pending;
    },
    runNow
  };
}
