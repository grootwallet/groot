import { describe, expect, it, vi } from 'vitest';
import { createLiveSync } from './live-sync';

function registry(kind: 'single_key' | 'multisig') {
  return {
    version: 1,
    selectedWalletId: 'selected',
    wallets: [{ id: 'selected', name: 'Wallet', network: 'regtest' as const, kind, descriptorChecksum: '12345678', createdAt: 1 }]
  };
}

describe('live wallet sync', () => {
  it('syncs the selected single-key or multisig wallet', async () => {
    for (const kind of ['single_key', 'multisig'] as const) {
      const wallet = {
        exists: vi.fn().mockResolvedValue(true),
        profiles: vi.fn().mockResolvedValue(registry(kind)),
        sync: vi.fn().mockResolvedValue(undefined),
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

  it('does nothing without an existing wallet and cannot be wedged by error reporting', async () => {
    const error = new Error('offline');
    const onError = vi.fn(() => { throw new Error('reporter failed'); });
    const wallet = {
      exists: vi.fn().mockResolvedValue(false),
      profiles: vi.fn(),
      sync: vi.fn(),
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

  it('coalesces concurrent wake-ups instead of overlapping native syncs', async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const wallet = {
      exists: vi.fn().mockResolvedValue(true),
      profiles: vi.fn().mockResolvedValue(registry('single_key')),
      sync: vi.fn().mockImplementation(() => { markStarted(); return blocked; }),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, 60_000);
    controller.start();
    await started;
    const second = controller.runNow();
    const third = controller.runNow();
    expect(wallet.sync).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([second, third]);
    expect(wallet.sync).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('runs the newly selected wallet immediately after an active sync finishes', async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const wallet = {
      exists: vi.fn().mockResolvedValue(true),
      profiles: vi.fn().mockResolvedValue(registry('single_key')),
      sync: vi.fn().mockImplementationOnce(() => { markStarted(); return blocked; }).mockResolvedValue(undefined),
      syncMultisig: vi.fn()
    };
    const controller = createLiveSync(wallet, 60_000);
    controller.start();
    await started;
    controller.restart();
    release();
    await vi.waitFor(() => expect(wallet.sync).toHaveBeenCalledTimes(2));
    controller.stop();
  });
});
