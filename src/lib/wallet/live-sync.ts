import type { WalletPort } from './contracts';

export type LiveSyncController = {
  start(): void;
  restart(): void;
  stop(): void;
  runNow(): Promise<void>;
};

type LiveSyncPort = Pick<WalletPort, 'exists' | 'profiles' | 'sync' | 'syncMultisig'>;

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
  let active: Promise<void> | undefined;
  let rerunRequested = false;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    clearTimer();
    if (enabled) timer = setTimeout(() => void runNow(), intervalMs);
  };

  const perform = async () => {
    try {
      if (!await wallet.exists()) return;
      const registry = await wallet.profiles();
      const selected = registry.wallets.find((profile) => profile.id === registry.selectedWalletId);
      if (!selected) return;
      if (selected.kind === 'multisig') await wallet.syncMultisig();
      else await wallet.sync();
    } catch (cause) {
      try { onError(cause); }
      catch { /* Error reporting must never disable future wallet syncs. */ }
    }
  };

  const runNow = async (): Promise<void> => {
    if (!enabled) return;
    clearTimer();
    if (active) return active;
    const pending = perform();
    active = pending;
    try { await pending; }
    finally {
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
      clearTimer();
      if (active) rerunRequested = true;
      else void runNow();
    },
    stop() {
      enabled = false;
      rerunRequested = false;
      clearTimer();
    },
    runNow
  };
}
