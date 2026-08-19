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
  let rerunRequested = false;
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
        cause.code === 'sync_cancelled'
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
      if (enabled && rerunRequested) {
        rerunRequested = false;
        void runNow();
      } else if (enabled) schedule();
    }
  };

  return {
    start() {
      if (enabled) return;
      enabled = true;
      void runNow();
    },
    restart() {
      enabled = true;
      consecutiveFailures = 0;
      clearTimer();
      if (active) rerunRequested = true;
      else void runNow();
    },
    stop() {
      enabled = false;
      rerunRequested = false;
      clearTimer();
      if (active) void wallet.cancelSync().catch(() => undefined);
    },
    runNow
  };
}
