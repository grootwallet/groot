export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest'] as const;
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

export type AppConfig = {
  network: SupportedNetwork;
  esploraUrl: string | null;
  explorerUrl: string | null;
};

const configuredNetwork = parseNetwork(import.meta.env.PUBLIC_BITCOIN_NETWORK as string | undefined);

export const defaultConfig: AppConfig = {
  network: configuredNetwork,
  esploraUrl: configuredNetwork === 'signet' ? 'https://mempool.space/signet/api' : configuredNetwork === 'testnet4' ? 'https://mempool.space/testnet4/api' : null,
  explorerUrl: configuredNetwork === 'signet' ? 'https://mempool.space/signet' : configuredNetwork === 'testnet4' ? 'https://mempool.space/testnet4' : null
};

export function parseNetwork(value: string | undefined): SupportedNetwork {
  if (value && SUPPORTED_NETWORKS.includes(value as SupportedNetwork)) return value as SupportedNetwork;
  return 'signet';
}

export function networkName(network: SupportedNetwork): string {
  return network === 'testnet4' ? 'Testnet4' : network[0].toUpperCase() + network.slice(1);
}
