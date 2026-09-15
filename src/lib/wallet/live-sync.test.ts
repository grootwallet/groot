import { describe, expect, it, vi } from 'vitest';
import { createLiveSync } from './live-sync';

describe('live wallet sync', () => {
  it('ignores an old wallet failure after selection restarts the scheduler', async () => {
    vi.useFakeTimers();
    let reject!: (cause: unknown) => void;
    const wallet = {
      sync: vi
        .fn()
        .mockImplementationOnce(() => new Promise<void>((_, fail) => (reject = fail)))
        .mockResolvedValue(undefined),
      syncMultisig: vi.fn(),
      cancelSync: vi.fn().mockResolvedValue(undefined)
    };
    const onError = vi.fn();
    const controller = createLiveSync(wallet, () => 'single_key', 1_000, onError);
    controller.start();
    const oldWallet = controller.runNow();
    controller.stop();
    controller.restart();
    reject({ code: 'wallet_locked' });
    await oldWallet;
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(wallet.sync).toHaveBeenCalledTimes(2);
    controller.stop();
    vi.useRealTimers();
  });
  it('syncs the selected single-key or multisig wallet', async () => {
    for (const kind of ['single_key', 'multisig'] as const) {
      const wallet = {
        sync: vi.fn().mockResolvedValue(undefined),
        cancelSync: vi.fn().mockResolvedValue(undefined),
        syncMultisig: vi.fn().mockResolvedValue(undefined)
      };
      const controller = createLiveSync(wallet, () => kind, 60_000);
      controller.start();
      await controller.runNow();
      expect(wallet.sync).toHaveBeenCalledTimes(kind === 'single_key' ? 1 : 0);
      expect(wallet.syncMultisig).toHaveBeenCalledTimes(kind === 'multisig' ? 1 : 0);
      controller.stop();
    }
  });

  it('lets persisted route data load before the first automatic sync', async () => {
    vi.useFakeTimers();
    const wallet = {
      sync: vi.fn().mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createLiveSync(wallet, () => 'single_key', 10_000);

    controller.start();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(wallet.sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(wallet.sync).toHaveBeenCalledOnce();

    controller.stop();
    vi.useRealTimers();
  });

  it('does nothing without a selected wallet and cannot be wedged by error reporting', async () => {
    const error = new Error('offline');
    const onError = vi.fn(() => {
      throw new Error('reporter failed');
    });
    const wallet = {
      sync: vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    let kind: 'single_key' | null = null;
    const controller = createLiveSync(wallet, () => kind, 60_000, onError);
    controller.start();
    await controller.runNow();
    expect(wallet.sync).not.toHaveBeenCalled();
    kind = 'single_key';
    await controller.runNow();
    expect(onError).toHaveBeenCalledWith(error);
    await controller.runNow();
    expect(wallet.sync).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('treats an unconfigured or active resumable first scan as expected scheduler state', async () => {
    const onError = vi.fn();
    const wallet = {
      sync: vi
        .fn()
        .mockRejectedValueOnce({ code: 'initial_scan_required' })
        .mockRejectedValueOnce({ code: 'scan_in_progress' })
        .mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, () => 'single_key', 60_000, onError);
    controller.start();
    await controller.runNow();
    await controller.runNow();
    await controller.runNow();
    expect(onError).not.toHaveBeenCalled();
    expect(wallet.sync).toHaveBeenCalledTimes(3);
    controller.stop();
  });

  it('observes a route-owned native sync instead of starting an overlapping refresh', async () => {
    const wallet = {
      sync: vi.fn().mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn(),
      syncStatus: vi.fn().mockResolvedValue({
        walletId: 'wallet-1',
        source: 'bitcoin_core',
        state: 'checking_pending',
        progressPercent: 99,
        chainHeight: 1,
        lastVerifiedHeight: 1,
        connectedPeers: null,
        requiredPeers: null,
        failureCode: null,
        updatedAt: 1
      })
    };
    const controller = createLiveSync(wallet, () => 'single_key', 60_000);
    controller.start();

    await controller.runNow();

    expect(wallet.syncStatus).toHaveBeenCalledOnce();
    expect(wallet.sync).not.toHaveBeenCalled();
    controller.stop();
  });

  it('treats a native single-flight race as expected scheduler state', async () => {
    const onError = vi.fn();
    const wallet = {
      sync: vi.fn().mockRejectedValue({ code: 'sync_in_progress' }),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, () => 'single_key', 60_000, onError);
    controller.start();

    await controller.runNow();

    expect(onError).not.toHaveBeenCalled();
    controller.stop();
  });

  it('backs off repeated failures and resets after a successful sync', async () => {
    vi.useFakeTimers();
    const wallet = {
      sync: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('still offline'))
        .mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, () => 'single_key', 1_000);
    controller.start();
    await controller.runNow();
    expect(wallet.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(wallet.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(wallet.sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(wallet.sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(wallet.sync).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(999);
    expect(wallet.sync).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(wallet.sync).toHaveBeenCalledTimes(4);
    controller.stop();
    vi.useRealTimers();
  });

  it('backs off a Mainnet admission failure until the user can retry node verification', async () => {
    vi.useFakeTimers();
    const wallet = {
      sync: vi.fn(),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi
        .fn()
        .mockRejectedValueOnce({ code: 'node_admission_required' })
        .mockResolvedValue(undefined)
    };
    const controller = createLiveSync(wallet, () => 'multisig', 1_000);
    controller.start();
    await controller.runNow();
    expect(wallet.syncMultisig).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(wallet.syncMultisig).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(wallet.syncMultisig).toHaveBeenCalledTimes(2);
    controller.stop();
    vi.useRealTimers();
  });

  it('coalesces concurrent wake-ups instead of overlapping native syncs', async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const wallet = {
      sync: vi.fn().mockImplementation(() => {
        markStarted();
        return blocked;
      }),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, () => 'single_key', 60_000);
    controller.start();
    void controller.runNow();
    await started;
    const second = controller.runNow();
    const third = controller.runNow();
    expect(wallet.sync).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([second, third]);
    expect(wallet.sync).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('cancels an in-flight native sync when automatic sync is stopped', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const wallet = {
      sync: vi.fn().mockImplementation(
        () =>
          new Promise<void>((_resolve, reject) => {
            markStarted();
            setTimeout(() => reject({ code: 'sync_cancelled' }), 0);
          })
      ),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, () => 'single_key', 60_000);
    controller.start();
    void controller.runNow();
    await started;
    controller.stop();
    expect(wallet.cancelSync).toHaveBeenCalledOnce();
  });

  it('cancels and drains an automatic sync before a manual refresh takes ownership', async () => {
    let rejectSync!: (cause: unknown) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const wallet = {
      sync: vi.fn().mockImplementation(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSync = reject;
            markStarted();
          })
      ),
      cancelSync: vi.fn().mockImplementation(async () => {
        rejectSync({ code: 'sync_cancelled' });
      }),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, () => 'single_key', 60_000);
    controller.start();
    void controller.runNow();
    await started;

    await controller.stopAndWait();

    expect(wallet.cancelSync).toHaveBeenCalledOnce();
    expect(wallet.sync).toHaveBeenCalledOnce();
  });

  it('defers the newly selected wallet sync until its cached route data can load', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    let markStarted!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const wallet = {
      sync: vi
        .fn()
        .mockImplementationOnce(() => {
          markStarted();
          return blocked;
        })
        .mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, () => 'single_key', 60_000);
    controller.start();
    const current = controller.runNow();
    await started;
    controller.restart();
    release();
    await current;
    await vi.advanceTimersByTimeAsync(59_999);
    expect(wallet.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(wallet.sync).toHaveBeenCalledTimes(2);
    controller.stop();
    vi.useRealTimers();
  });
});
