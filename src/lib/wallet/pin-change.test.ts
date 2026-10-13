import { describe, it, expect } from 'vitest';
import { DummyWalletAdapter } from './dummy';
import { prototypeCredential } from './dummy-state';

describe('hardware app PIN lifecycle', () => {
  it('preserves software BIP39 credentials', async () => {
    const adapter = new DummyWalletAdapter();
    const { profile } = await adapter.session();
    await expect(
      adapter.changePin(prototypeCredential, 'replacement', profile.id)
    ).rejects.toMatchObject({ code: 'invalid_credential' });
    await adapter.lock();
    await expect(adapter.unlock(prototypeCredential)).resolves.toBeUndefined();
  });
  it('changes multisig authorization as well as unlock, and leaves other wallets unlocked', async () => {
    const adapter = new DummyWalletAdapter();
    await adapter.selectWallet('fixture-multisig');
    await adapter.unlock(prototypeCredential);
    await expect(
      adapter.changePin('wrong', 'replacement', 'fixture-multisig')
    ).rejects.toMatchObject({ code: 'invalid_credential' });
    await expect(
      adapter.changePin(prototypeCredential, 'replacement', 'fixture-single')
    ).rejects.toMatchObject({ code: 'invalid_credential' });
    await adapter.changePin(prototypeCredential, 'replacement', 'fixture-multisig');
    expect((await adapter.session()).unlocked).toBe(false);
    await expect(adapter.unlock(prototypeCredential)).rejects.toMatchObject({
      code: 'invalid_credential'
    });
    await adapter.unlock('replacement');
    await expect(adapter.exportMultisig('replacement')).resolves.toContain('version');
    await expect(adapter.exportMultisig(prototypeCredential)).rejects.toMatchObject({
      code: 'invalid_credential'
    });
    expect((await adapter.selectWallet('fixture-single')).unlocked).toBe(true);
  });
});
