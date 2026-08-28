import { describe, expect, it } from 'vitest';
import { fromNativeWalletSyncSource, toNativeWalletSyncSource } from './tauri';

describe('native wallet sync-source adapter', () => {
  it('sends the exact snake-case fields required by the Rust command', () => {
    expect(
      toNativeWalletSyncSource({
        type: 'compact_filters',
        peers: ['127.0.0.1:18444'],
        requiredPeers: 1,
        discoverPeers: false,
        torProxy: null
      })
    ).toEqual({
      type: 'compact_filters',
      peers: ['127.0.0.1:18444'],
      required_peers: 1,
      discover_peers: false,
      tor_proxy: null
    });
  });

  it('maps stored native settings back to the public frontend contract', () => {
    expect(
      fromNativeWalletSyncSource({
        type: 'compact_filters',
        peers: ['127.0.0.1:18444'],
        required_peers: 1,
        discover_peers: false
      })
    ).toEqual({
      type: 'compact_filters',
      peers: ['127.0.0.1:18444'],
      requiredPeers: 1,
      discoverPeers: false,
      torProxy: null
    });
  });
});
