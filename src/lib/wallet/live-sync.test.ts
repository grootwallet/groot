import { describe, expect, it, vi } from 'vitest';
import { createLiveSync } from './live-sync';

function registry(kind: 'single_key' | 'multisig') {
  return {
    version: 1,
    selectedWalletId: 'selected',
    wallets: [
      {
        id: 'selected',
        name: 'Wallet',
        network: 'regtest' as const,
        kind,
        descriptorChecksum: '12345678',
        createdAt: 1
      }
    ]
  };
}

describe('live wallet sync', () => {
  it('syncs the selected single-key or multisig wallet', async () => {
    for (const kind of ['single_key', 'multisig'] as const) {
      const wallet = {
        exists: vi.fn().mockResolvedValue(true),
        profiles: vi.fn().mockResolvedValue(registry(kind)),
        sync: vi.fn().mockResolvedValue(undefined),
        cancelSync: vi.fn().mockResolvedValue(undefined),
        syncMultisig: vi.fn().mockResolvedValue(undefined)
      };
      const controller = createLiveSync(wallet, 60_000);
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
      exists: vi.fn().mockResolvedValue(true),
      profiles: vi.fn().mockResolvedValue(registry('single_key')),
      sync: vi.fn().mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createLiveSync(wallet, 10_000);

    controller.start();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(wallet.sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(wallet.sync).toHaveBeenCalledOnce();

    controller.stop();
    vi.useRealTimers();
  });

  it('does nothing without an existing wallet and cannot be wedged by error reporting', async () => {
    const error = new Error('offline');
    const onError = vi.fn(() => {
      throw new Error('reporter failed');
    });
    const wallet = {
      exists: vi.fn().mockResolvedValue(false),
      profiles: vi.fn(),
      sync: vi.fn(),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, 60_000, onError);
    controller.start();
    await controller.runNow();
    expect(wallet.profiles).not.toHaveBeenCalled();
    wallet.exists.mockResolvedValue(true);
    wallet.profiles.mockRejectedValue(error);
    await controller.runNow();
    expect(onError).toHaveBeenCalledWith(error);
    wallet.profiles.mockResolvedValue(registry('single_key'));
    await controller.runNow();
    expect(wallet.sync).toHaveBeenCalledOnce();
    controller.stop();
  });

  it('backs off repeated failures and resets after a successful sync', async () => {
    vi.useFakeTimers();
    const wallet = {
      exists: vi.fn().mockResolvedValue(true),
      profiles: vi.fn().mockResolvedValue(registry('single_key')),
      sync: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('still offline'))
        .mockResolvedValue(undefined),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, 1_000);
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
      exists: vi.fn().mockResolvedValue(true),
      profiles: vi.fn().mockResolvedValue(registry('single_key')),
      sync: vi.fn().mockImplementation(() => {
        markStarted();
        return blocked;
      }),
      cancelSync: vi.fn().mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, 60_000);
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
      exists: vi.fn().mockResolvedValue(true),
      profiles: vi.fn().mockResolvedValue(registry('single_key')),
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
    const controller = createLiveSync(wallet, 60_000);
    controller.start();
    void controller.runNow();
    await started;
    controller.stop();
    expect(wallet.cancelSync).toHaveBeenCalledOnce();
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
      exists: vi.fn().mockResolvedValue(true),
      profiles: vi.fn().mockResolvedValue(registry('single_key')),
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
    const controller = createLiveSync(wallet, 60_000);
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
