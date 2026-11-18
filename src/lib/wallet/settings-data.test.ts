import { describe, expect, it, vi } from 'vitest';
import { readSettingsWalletData } from './settings-data';
import type { WalletPort } from './contracts';

const methods = [
  'externalSignerWallet',
  'hardwareHealthChecks',
  'nodeConfig',
  'syncSource',
  'networkSetupSources',
  'recoveryScanSettings',
  'recoveryScanStatus'
] as const;
function reader() {
  return Object.fromEntries(
    methods.map((name) => [name, vi.fn().mockResolvedValue(name)])
  ) as unknown as Pick<WalletPort, (typeof methods)[number]>;
}

describe('settings screen snapshot lifetime', () => {
  for (const delayed of methods) {
    it(`does not publish or continue after ${delayed} resolves for an obsolete screen`, async () => {
      const service = reader();
      let resolve!: (value: unknown) => void;
      vi.mocked(service[delayed]).mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }) as never
      );
      let current = true;
      const result = readSettingsWalletData(service, true, () => current);
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      current = false;
      resolve('obsolete');
      expect(await result).toBeNull();
      if (['externalSignerWallet', 'hardwareHealthChecks'].includes(delayed))
        expect(service.nodeConfig).not.toHaveBeenCalled();
      if (delayed !== 'recoveryScanStatus')
        expect(service.recoveryScanStatus).not.toHaveBeenCalled();
    });
  }
  it('publishes only the newer load when completions arrive out of order', async () => {
    const old = reader(),
      latest = reader();
    let resolve!: (value: unknown) => void;
    vi.mocked(old.recoveryScanStatus).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }) as never
    );
    let generation = 1;
    const first = readSettingsWalletData(old, false, () => generation === 1);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    generation = 2;
    expect(await readSettingsWalletData(latest, false, () => generation === 2)).toMatchObject({
      scanStatus: 'recoveryScanStatus',
      signer: null,
      health: []
    });
    resolve('old scan status');
    expect(await first).toBeNull();
    expect(latest.externalSignerWallet).not.toHaveBeenCalled();
  });
  it('does not dispatch cancelled reads and preserves errors for an active caller', async () => {
    const service = reader();
    expect(await readSettingsWalletData(service, true, () => false)).toBeNull();
    expect(service.externalSignerWallet).not.toHaveBeenCalled();
    vi.mocked(service.nodeConfig).mockRejectedValue(new Error('offline'));
    await expect(readSettingsWalletData(service, false, () => true)).rejects.toThrow('offline');
  });
});
