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

  it('scopes label suggestions to the selected unlocked wallet and records normalized reuse', async () => {
    const adapter = new DummyWalletAdapter();
    const registry = await adapter.profiles();
    const singleKey = registry.wallets.find((wallet) => wallet.kind === 'single_key')!;
    const multisig = registry.wallets.find((wallet) => wallet.kind === 'multisig')!;

    const singleSnapshot = await adapter.snapshot();
    expect(singleSnapshot.labelSuggestions.map((item) => item.text)).toContain('Savings');
    expect(singleSnapshot.labelSuggestions.map((item) => item.text)).not.toContain(
      'Family reserve'
    );

    const originalSavings = singleSnapshot.labelSuggestions.find(
      (item) => item.text === 'Savings'
    )!;
    await adapter.createAddress(['  Savings  ']);
    const reused = (await adapter.snapshot()).labelSuggestions.find(
      (item) => item.text === 'Savings'
    );
    expect(reused).toMatchObject({
      id: originalSavings.id,
      assignmentCount: 2,
      usedForReceive: true
    });

    await adapter.selectWallet(multisig.id);
    await expect(adapter.multisigSnapshot()).rejects.toMatchObject({ code: 'wallet_locked' });
    await adapter.unlock('prototype-passphrase');
    const multisigSnapshot = await adapter.multisigSnapshot();
    expect(multisigSnapshot.labelSuggestions.map((item) => item.text)).toEqual(['Family reserve']);

    await adapter.selectWallet(singleKey.id);
    expect((await adapter.snapshot()).labelSuggestions.map((item) => item.text)).toContain(
      'Savings'
    );
  });
});
