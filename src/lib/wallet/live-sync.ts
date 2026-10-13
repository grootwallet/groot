import type { WalletProfile, WalletSnapshotPort, WalletSyncStatus } from './contracts';

export type LiveSyncController = {
  start(): void;
  restart(): void;
  stop(): void;
  stopAndWait(): Promise<void>;
  runNow(): Promise<void>;
};

export const LIVE_SYNC_INTERVAL_MS = 35_000;

type LiveSyncPort = Pick<WalletSnapshotPort, 'sync' | 'cancelSync' | 'syncMultisig'> & {
  fullRescan?: (credential: string) => Promise<unknown>;
  testNodeConnection?: () => Promise<unknown>;
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
  intervalMs = LIVE_SYNC_INTERVAL_MS,
  onError: (cause: unknown) => void = () => undefined
): LiveSyncController {
  let enabled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let generation = 0;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    clearTimer();
    if (enabled) timer = setTimeout(() => void runNow(), intervalMs);
  };

  const perform = async (startedGeneration: number): Promise<void> => {
    const report = (cause: unknown) => {
      try {
        onError(cause);
      } catch {
        /* Error reporting must never disable future wallet syncs. */
      }
    };
    try {
      const kind = selectedWalletKind();
      if (!kind) return;
      // A route-owned refresh survives read-only navigation. Observe that
      // native single-flight operation instead of repeatedly invoking a second
      // sync and filling diagnostics with expected sync_in_progress failures.
      if (wallet.syncStatus) {
        try {
          if (isWalletSyncActive(await wallet.syncStatus())) return;
        } catch {
          // The sync call remains authoritative when status polling is unavailable.
        }
      }
      if (kind === 'multisig') await wallet.syncMultisig(true);
      else await wallet.sync(true);
    } catch (cause) {
      if (!enabled || startedGeneration !== generation) return;
      let failure = cause;
      if (
        typeof failure === 'object' &&
        failure !== null &&
        'code' in failure &&
        String(failure.code) === 'node_admission_required' &&
        wallet.testNodeConnection
      ) {
        try {
          await wallet.testNodeConnection();
          const kind = selectedWalletKind();
          if (!kind) return;
          if (kind === 'multisig') await wallet.syncMultisig(true);
          else await wallet.sync(true);
          return;
        } catch (retryCause) {
          failure = retryCause;
        }
      }
      if (
        typeof failure === 'object' &&
        failure !== null &&
        'code' in failure &&
        String(failure.code) === 'initial_scan_required'
      ) {
        try {
          await wallet.fullRescan?.('');
        } catch (scanCause) {
          if (
            typeof scanCause === 'object' &&
            scanCause !== null &&
            'code' in scanCause &&
            ['sync_cancelled', 'sync_in_progress', 'scan_in_progress'].includes(
              String(scanCause.code)
            )
          )
            return;
          report(scanCause);
        }
        return;
      }
      if (
        typeof failure === 'object' &&
        failure !== null &&
        'code' in failure &&
        ['sync_cancelled', 'sync_in_progress', 'scan_in_progress'].includes(String(failure.code))
      ) {
        return;
      }
      report(failure);
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
      await pending;
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
