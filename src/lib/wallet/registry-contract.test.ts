import { invoke } from '@tauri-apps/api/core';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { WalletProfile, WalletRegistry } from './contracts';
import { DummyWalletAdapter } from './dummy';
import { TauriWalletAdapter } from './tauri';
import { INACTIVITY_TIMEOUT_CHOICES } from './policy';
import fixture from './fixtures/registry-contract.json';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// Explicit consumer field reads catch Rust/TypeScript name and representation
// drift. Rust's registry_contract integration test independently serializes real
// native structs and checks these same synthetic JSON fixtures.
function consumeRegistry(registry: WalletRegistry) {
  return {
    version: registry.version,
    selectedWalletId: registry.selectedWalletId,
    inactivityTimeoutMinutes: registry.inactivityTimeoutMinutes,
    wallets: registry.wallets.map((profile) => ({
      id: profile.id,
      name: profile.name,
      network: profile.network,
      kind: profile.kind,
      descriptorChecksum: profile.descriptorChecksum,
      createdAt: profile.createdAt,
      backupVerified: profile.backupVerified
    }))
  };
}

describe('registry wire contract', () => {
  it('keeps frontend field types and wallet kinds compatible with the native fixture', () => {
    expectTypeOf<WalletProfile['kind']>().toEqualTypeOf<'single_key' | 'multisig' | 'watch_only'>();
    const profile = {
      ...fixture.registry.wallets[0],
      network: 'signet',
      kind: 'single_key'
    } satisfies WalletProfile;
    const registry = { ...fixture.registry, wallets: [profile] } satisfies WalletRegistry;
    expect(registry).toEqual({ ...fixture.registry, wallets: [fixture.registry.wallets[0]] });
  });

  it.each([fixture.emptyRegistry, fixture.registry])(
    'consumes the Rust-verified registry fixture with $wallets.length profiles',
    async (expected) => {
      vi.mocked(invoke).mockResolvedValueOnce(structuredClone(expected));
      const registry = await new TauriWalletAdapter().profiles();
      expect(invoke).toHaveBeenLastCalledWith('wallet_profiles', undefined);
      expect(consumeRegistry(registry)).toEqual(expected);
    }
  );

  it.each(fixture.timeoutChoices)(
    'preserves native timeout %s and its returned registry',
    async (minutes) => {
      const expected = { ...fixture.registry, inactivityTimeoutMinutes: minutes };
      vi.mocked(invoke).mockResolvedValueOnce(structuredClone(expected));
      const result = await new TauriWalletAdapter().saveInactivityTimeout(minutes);
      expect(invoke).toHaveBeenLastCalledWith('wallet_inactivity_timeout_save', { minutes });
      expect(consumeRegistry(result)).toEqual(expected);
    }
  );

  it('preserves a rejected native timeout error', async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'invalid_inactivity_timeout' });
    await expect(new TauriWalletAdapter().saveInactivityTimeout(2)).rejects.toMatchObject({
      code: 'invalid_inactivity_timeout'
    });
  });
});

describe('browser timeout conformance to native fixtures', () => {
  it('shares exactly the Rust-verified timeout choices', () => {
    expect(INACTIVITY_TIMEOUT_CHOICES).toEqual(fixture.timeoutChoices);
  });
  it('uses the native default and exact allowed choices, preserving state on rejection', async () => {
    const adapter = new DummyWalletAdapter();
    expect((await adapter.profiles()).inactivityTimeoutMinutes).toBe(
      fixture.emptyRegistry.inactivityTimeoutMinutes
    );
    for (let minutes = 0; minutes <= 61; minutes++) {
      const before = await adapter.profiles();
      if (fixture.timeoutChoices.includes(minutes)) {
        const result = await adapter.saveInactivityTimeout(minutes);
        expect(result).toEqual({ ...before, inactivityTimeoutMinutes: minutes });
      } else {
        await expect(adapter.saveInactivityTimeout(minutes)).rejects.toMatchObject({
          code: 'invalid_inactivity_timeout'
        });
        expect(await adapter.profiles()).toEqual(before);
      }
    }
  });

  it.each([-1, 1.5, NaN, Infinity, -Infinity])(
    'rejects non-native timeout %s without mutation',
    async (minutes) => {
      const adapter = new DummyWalletAdapter();
      const before = await adapter.profiles();
      await expect(adapter.saveInactivityTimeout(minutes)).rejects.toMatchObject({
        code: 'invalid_inactivity_timeout'
      });
      expect(await adapter.profiles()).toEqual(before);
    }
  );

  it('requires the selected wallet to be unlocked before changing preferences', async () => {
    const adapter = new DummyWalletAdapter();
    await adapter.lock();
    const before = await adapter.profiles();
    await expect(adapter.saveInactivityTimeout(15)).rejects.toMatchObject({
      code: 'wallet_locked'
    });
    expect(await adapter.profiles()).toEqual(before);
  });
});
