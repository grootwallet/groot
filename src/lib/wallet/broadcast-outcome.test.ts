import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { TauriWalletAdapter } from './tauri';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('accepted broadcast with pending local recording', () => {
  it.each(['software', 'external', 'multisig'])(
    'preserves the %s accepted outcome without normalizing a nonexistent snapshot',
    async (kind) => {
      const result = {
        txid: 'synthetic-txid',
        snapshot: null,
        syncPending: true,
        persistencePending: true
      };
      vi.mocked(invoke).mockResolvedValueOnce(result);
      const adapter = new TauriWalletAdapter();
      const outcome =
        kind === 'software'
          ? await adapter.signAndBroadcast('proposal', 'binding', 'synthetic')
          : kind === 'external'
            ? await adapter.broadcastExternalSignerProposal('proposal', 'psbt', 'synthetic')
            : await adapter.broadcastMultisigProposal('proposal', 'psbt', 'synthetic');
      expect(outcome).toEqual(result);
    }
  );
});
