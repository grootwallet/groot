import type { CoreNodeConfig } from './contracts';
import type { SupportedNetwork as Network } from '$lib/config';

export type NodeFormMode = 'managed' | 'local_core' | 'remote_core' | 'tor';
export function localRpcUrl(network: Network): string {
  const ports = { regtest: 18443, signet: 38332, testnet4: 48332, mainnet: 8332 };
  return `http://127.0.0.1:${ports[network]}`;
}
export function localNodeConfig(network: Network): CoreNodeConfig {
  return {
    backend: { type: 'local_core', url: localRpcUrl(network) },
    auth: network === 'regtest' ? 'cookie' : 'user_pass',
    username: null,
    torProxy: null
  };
}
export function isManagedNodeConfig(config: CoreNodeConfig, network: Network): boolean {
  return (
    network === 'mainnet' &&
    config.backend.type === 'remote_core' &&
    config.backend.url === 'https://bitcoin-rpc.usegroot.com/' &&
    config.auth === 'user_pass' &&
    /^groot-[0-9a-f]{24}$/.test(config.username ?? '') &&
    !config.torProxy
  );
}
export function nodeFormConfig(
  mode: Exclude<NodeFormMode, 'managed'>,
  network: Network
): CoreNodeConfig {
  if (mode === 'local_core') return localNodeConfig(network);
  return {
    backend: {
      type: 'remote_core',
      url: mode === 'tor' ? 'http://example.onion:8332' : 'https://'
    },
    auth: 'user_pass',
    username: '',
    torProxy: mode === 'tor' ? '127.0.0.1:9050' : null
  };
}
