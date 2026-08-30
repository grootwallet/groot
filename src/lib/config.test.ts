import { describe, expect, it } from 'vitest';
import { explorerUrlForNetwork, transactionExplorerUrl } from './config';

const TXID = 'A'.repeat(64);

describe('block explorer URLs', () => {
  it('maps approved public networks to their mempool.space explorer', () => {
    expect(explorerUrlForNetwork('mainnet')).toBe('https://mempool.space');
    expect(explorerUrlForNetwork('signet')).toBe('https://mempool.space/signet');
    expect(explorerUrlForNetwork('testnet4')).toBe('https://mempool.space/testnet4');
  });

  it('does not expose local regtest lookups to a public explorer', () => {
    expect(explorerUrlForNetwork('regtest')).toBeNull();
    expect(transactionExplorerUrl('regtest', TXID)).toBeNull();
  });

  it('builds a normalized transaction URL only for a valid txid', () => {
    expect(transactionExplorerUrl('signet', TXID)).toBe(
      `https://mempool.space/signet/tx/${TXID.toLowerCase()}`
    );
    expect(transactionExplorerUrl('mainnet', TXID)).toBe(
      `https://mempool.space/tx/${TXID.toLowerCase()}`
    );
    expect(transactionExplorerUrl('testnet4', 'not-a-txid')).toBeNull();
  });
});
