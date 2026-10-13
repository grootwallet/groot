import { describe, expect, it, vi } from 'vitest';
import type { WalletSelection } from './contracts';
import { createSessionMonitor } from './session-monitor';

function selection(unlocked: boolean): WalletSelection {
  return {
    profile: {
      id: 'selected',
      name: 'Wallet',
      network: 'regtest',
      kind: 'multisig',
      descriptorChecksum: '12345678',
      createdAt: 1,
      backupVerified: true
    },
    unlocked
  };
}

describe('wallet session monitor', () => {
  it.each(['stop', 'restart', 'review'] as const)(
    'discards a pending expiry response after %s',
    async (transition) => {
      let resolve!: (value: WalletSelection) => void;
      let paused = false;
      const wallet = {
        session: vi
          .fn()
          .mockImplementationOnce(() => new Promise<WalletSelection>((done) => (resolve = done)))
          .mockResolvedValue(selection(false))
      };
      const onLocked = vi.fn();
      const monitor = createSessionMonitor(wallet, onLocked, () => paused);
      monitor.start();
      const pending = monitor.runNow();
      if (transition === 'review') paused = true;
      else monitor.stop();
      if (transition === 'restart') monitor.start();
      resolve(selection(false));
      await pending;
      expect(onLocked).not.toHaveBeenCalled();
      paused = false;
      monitor.start();
      await monitor.runNow();
      expect(onLocked).toHaveBeenCalledOnce();
      monitor.stop();
    }
  );
  it('routes an expired session even when network sync is not running', async () => {
    vi.useFakeTimers();
    const wallet = { session: vi.fn().mockResolvedValue(selection(false)) };
    const onLocked = vi.fn();
    const monitor = createSessionMonitor(wallet, onLocked, () => false, 1_000);

    monitor.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(wallet.session).toHaveBeenCalledOnce();
    expect(onLocked).toHaveBeenCalledWith(selection(false));
    monitor.stop();
    vi.useRealTimers();
  });

  it('does not navigate for a live session', async () => {
    const wallet = { session: vi.fn().mockResolvedValue(selection(true)) };
    const onLocked = vi.fn();
    const monitor = createSessionMonitor(wallet, onLocked, () => false);

    monitor.start();
    await monitor.runNow();

    expect(onLocked).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('defers expiry checks during an active hardware review and resumes afterward', async () => {
    let hardwareReviewActive = true;
    const wallet = { session: vi.fn().mockResolvedValue(selection(false)) };
    const onLocked = vi.fn();
    const monitor = createSessionMonitor(wallet, onLocked, () => hardwareReviewActive);

    monitor.start();
    await monitor.runNow();
    expect(wallet.session).not.toHaveBeenCalled();

    hardwareReviewActive = false;
    await monitor.runNow();
    expect(onLocked).toHaveBeenCalledOnce();
    monitor.stop();
  });
});
