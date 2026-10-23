import { describe, expect, it } from 'vitest';
import { localNodeConfig, localRpcUrl, nodeFormConfig, isManagedNodeConfig } from './node-form';
describe('node connection form defaults (native validation remains authoritative)', () => {
  it.each([
    ['regtest', 18443, 'cookie'],
    ['signet', 38332, 'user_pass'],
    ['testnet4', 48332, 'user_pass'],
    ['mainnet', 8332, 'user_pass']
  ] as const)('keeps %s defaults isolated', (network, port, auth) => {
    expect(localRpcUrl(network)).toBe(`http://127.0.0.1:${port}`);
    expect(localNodeConfig(network).auth).toBe(auth);
  });
  it('creates independent forms with no retained endpoint username or credentials', () => {
    const previous = nodeFormConfig('remote_core', 'testnet4');
    previous.username = 'synthetic';
    previous.backend.url = 'https://node.invalid';
    expect(nodeFormConfig('remote_core', 'testnet4')).toEqual({
      backend: { type: 'remote_core', url: 'https://' },
      auth: 'user_pass',
      username: '',
      torProxy: null
    });
    expect(nodeFormConfig('tor', 'testnet4').torProxy).toBe('127.0.0.1:9050');
    expect(nodeFormConfig('local_core', 'testnet4').torProxy).toBeNull();
  });
  it('recognizes only the complete managed presentation tuple', () => {
    const config = {
      backend: { type: 'remote_core' as const, url: 'https://bitcoin-rpc.usegroot.com/' },
      auth: 'user_pass' as const,
      username: 'groot-' + 'a'.repeat(24),
      torProxy: null
    };
    expect(isManagedNodeConfig(config, 'mainnet')).toBe(true);
    for (const invalid of [
      { ...config, backend: { ...config.backend, url: 'https://node.invalid' } },
      { ...config, username: 'groot-short' },
      { ...config, torProxy: '127.0.0.1:9050' }
    ])
      expect(isManagedNodeConfig(invalid, 'mainnet')).toBe(false);
    expect(isManagedNodeConfig(config, 'testnet4')).toBe(false);
  });
});
