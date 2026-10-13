import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriWalletAdapter } from './tauri';
import { sats, type WalletSnapshot } from './contracts';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const snapshot: WalletSnapshot = {
  network: 'regtest',
  balance: { total: sats(0), confirmed: sats(0), pending: sats(0), trustedPending: sats(0) },
  transactions: [],
  utxos: [],
  receiveAddresses: [],
  labelSuggestions: [],
  syncedAt: null,
  chainTip: { height: 0, observedAt: null, status: 'unknown' }
};
const envelope = {
  id: 'transaction:1',
  event: { type: 'payment_received', txid: 'synthetic', amount: 1, balance: 1 }
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
let selected = 'A';
let read: () => Promise<unknown>;
let acknowledge: () => Promise<unknown>;
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  selected = 'A';
  read = async () => ({ sessionId: 'session-A', envelopes: [] });
  acknowledge = async () => undefined;
  vi.mocked(invoke).mockImplementation(async (name, args) => {
    if (name === 'wallet_profiles') return { selectedWalletId: selected, wallets: [] };
    if (name === 'wallet_select') {
      selected = (args as { walletId: string }).walletId;
      return { profile: { id: selected }, unlocked: true };
    }
    if (name === 'wallet_session') return { profile: { id: selected }, unlocked: false };
    if (name === 'wallet_notifications') return read();
    if (name === 'wallet_notifications_ack') return acknowledge();
    if (
      [
        'wallet_snapshot',
        'multisig_snapshot',
        'wallet_sync',
        'multisig_sync',
        'wallet_full_rescan'
      ].includes(name)
    )
      return structuredClone(snapshot);
    if (name.includes('broadcast'))
      return { snapshot: structuredClone(snapshot), txid: 'synthetic' };
    return undefined;
  });
});
async function adapter() {
  const wallet = new TauriWalletAdapter();
  await wallet.profiles();
  const listener = vi.fn();
  wallet.subscribe(listener);
  return { wallet, listener };
}
describe('wallet-scoped durable notification delivery', () => {
  it.each(['switch', 'switch-back', 'lock', 'expired', 'delete', 'reset'])(
    'suppresses an old reply and acknowledgement after %s',
    async (action) => {
      const pending = deferred<unknown>();
      read = () => pending.promise;
      const { wallet, listener } = await adapter();
      await wallet.snapshot();
      if (action.startsWith('switch')) await wallet.selectWallet('B');
      if (action === 'switch-back') await wallet.selectWallet('A');
      if (action === 'lock') await wallet.lock();
      if (action === 'expired') await wallet.session();
      if (action === 'delete') await wallet.deleteWallet('synthetic', 'synthetic');
      if (action === 'reset') await wallet.resetRegtestWallet('RESET REGTEST');
      pending.resolve({ sessionId: 'session-A', envelopes: [envelope] });
      await settle();
      expect(listener).not.toHaveBeenCalled();
      expect(
        vi.mocked(invoke).mock.calls.filter(([name]) => name === 'wallet_notifications_ack')
      ).toEqual([]);
    }
  );
  it('binds a successful acknowledgement to the wallet and native session', async () => {
    read = async () => ({ sessionId: 'session-A', envelopes: [envelope] });
    const { wallet, listener } = await adapter();
    await wallet.snapshot();
    await settle();
    expect(listener).toHaveBeenCalledWith(envelope.event);
    expect(invoke).toHaveBeenCalledWith('wallet_notifications_ack', {
      multisig: false,
      walletId: 'A',
      sessionId: 'session-A',
      ids: ['transaction:1']
    });
  });
  it('shares one drain within a context, but does not block the next wallet', async () => {
    const pending = deferred<unknown>();
    read = () => pending.promise;
    const { wallet } = await adapter();
    await Promise.all([wallet.snapshot(), wallet.snapshot()]);
    expect(
      vi.mocked(invoke).mock.calls.filter(([name]) => name === 'wallet_notifications')
    ).toHaveLength(1);
    await wallet.selectWallet('B');
    await wallet.snapshot();
    expect(
      vi.mocked(invoke).mock.calls.filter(([name]) => name === 'wallet_notifications')
    ).toHaveLength(2);
    pending.resolve({ sessionId: 'session', envelopes: [] });
    await settle();
  });
  it.each([
    'snapshot',
    'multisigSnapshot',
    'signAndBroadcast',
    'broadcastExternalSignerProposal',
    'broadcastMultisigProposal'
  ] as const)('%s completes independently of a slow or failed drain', async (method) => {
    const pending = deferred<unknown>();
    read = () => pending.promise;
    const { wallet } = await adapter();
    if (method === 'snapshot' || method === 'multisigSnapshot')
      await expect(wallet[method]()).resolves.toEqual(snapshot);
    else if (method === 'signAndBroadcast')
      await expect(
        wallet.signAndBroadcast('id', 'synthetic-review', 'synthetic')
      ).resolves.toMatchObject({
        snapshot
      });
    else
      await expect(wallet[method]('id', 'synthetic-psbt', 'synthetic')).resolves.toMatchObject({
        snapshot
      });
    pending.reject(new Error('synthetic notification transport failure'));
    await settle();
  });
  it('retries unacknowledged events after an acknowledgement failure', async () => {
    read = async () => ({ sessionId: 'session-A', envelopes: [envelope] });
    acknowledge = async () => {
      throw new Error('synthetic');
    };
    const { wallet, listener } = await adapter();
    await wallet.snapshot();
    await settle();
    acknowledge = async () => undefined;
    await wallet.snapshot();
    await settle();
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('does not acknowledge when no listener can receive the event', async () => {
    const wallet = new TauriWalletAdapter();
    await wallet.profiles();
    await wallet.snapshot();
    expect(vi.mocked(invoke).mock.calls.some(([name]) => name === 'wallet_notifications')).toBe(
      false
    );
  });
  it('does not publish a sync from an earlier A to B to A lifecycle', async () => {
    const pending = deferred<unknown>();
    const { wallet, listener } = await adapter();
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((name, args) =>
      name === 'wallet_sync' ? pending.promise : original(name, args)
    );
    const sync = wallet.sync();
    await wallet.selectWallet('B');
    await wallet.selectWallet('A');
    pending.resolve(snapshot);
    await sync;
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });
});
