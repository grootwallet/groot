import type { WalletSelection } from './contracts';

export type SessionMonitorController = {
  start(): void;
  stop(): void;
  runNow(): Promise<void>;
};

type SessionMonitorPort = {
  session(): Promise<WalletSelection>;
};

/**
 * Checks the native, non-refreshing wallet session independently of network
 * sync. This keeps automatic lock authoritative on routes that deliberately
 * pause background sync, such as Settings and Send.
 */
export function createSessionMonitor(
  wallet: SessionMonitorPort,
  onLocked: (selection: WalletSelection) => void | Promise<void>,
  paused: () => boolean,
  intervalMs = 1_000,
  onError: (cause: unknown) => void = () => undefined
): SessionMonitorController {
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

  const perform = async () => {
    if (paused()) return;
    const startedGeneration = generation;
    try {
      const selection = await wallet.session();
      if (!enabled || startedGeneration !== generation || paused()) return;
      if (!selection.unlocked) await onLocked(selection);
    } catch (cause) {
      if (!enabled || startedGeneration !== generation || paused()) return;
      try {
        onError(cause);
      } catch {
        /* Session error reporting must never stop future lock checks. */
      }
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
      schedule();
    },
    stop() {
      enabled = false;
      generation += 1;
      clearTimer();
    },
    runNow
  };
}
