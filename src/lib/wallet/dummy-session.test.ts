import { describe, expect, it } from 'vitest';
import { DummyWalletAdapter } from './dummy';

describe('DummyWalletAdapter wallet sessions', () => {
  it('stores one inactivity timeout preference for every wallet', async () => {
    const adapter = new DummyWalletAdapter();

    expect((await adapter.profiles()).inactivityTimeoutMinutes).toBe(5);
    expect((await adapter.saveInactivityTimeout(15)).inactivityTimeoutMinutes).toBe(15);
    expect((await adapter.profiles()).inactivityTimeoutMinutes).toBe(15);
    await expect(adapter.saveInactivityTimeout(0)).rejects.toMatchObject({
      code: 'invalid_inactivity_timeout'
    });
  });

  it('keeps wallet sessions independent and locks only the selected wallet', async () => {
    const adapter = new DummyWalletAdapter();
    const registry = await adapter.profiles();
    const singleKey = registry.wallets.find((wallet) => wallet.kind === 'single_key');
    const multisig = registry.wallets.find((wallet) => wallet.kind === 'multisig');

    expect(singleKey).toBeDefined();
    expect(multisig).toBeDefined();

    await expect(adapter.selectWallet(multisig!.id)).resolves.toMatchObject({
      profile: { id: multisig!.id },
      unlocked: false
    });
    await expect(adapter.multisigSnapshot()).rejects.toMatchObject({ code: 'wallet_locked' });

    await adapter.unlock('prototype-passphrase');
    await expect(adapter.multisigSnapshot()).resolves.toMatchObject({
      network: expect.any(String)
    });

    await expect(adapter.selectWallet(singleKey!.id)).resolves.toMatchObject({
      profile: { id: singleKey!.id },
      unlocked: true
    });
    await expect(adapter.snapshot()).resolves.toMatchObject({ network: expect.any(String) });

    await adapter.lock();
    await expect(adapter.snapshot()).rejects.toMatchObject({ code: 'wallet_locked' });

    await expect(adapter.selectWallet(multisig!.id)).resolves.toMatchObject({
      profile: { id: multisig!.id },
      unlocked: true
    });
    await expect(adapter.multisigSnapshot()).resolves.toMatchObject({
      network: expect.any(String)
    });
  });
});
