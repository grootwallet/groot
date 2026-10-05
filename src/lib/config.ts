export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest', 'mainnet'] as const;
export const SWITCHABLE_NETWORKS = ['regtest', 'testnet4', 'mainnet'] as const;
export const APP_VERSION = '0.5.0';
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];
export type SwitchableNetwork = (typeof SWITCHABLE_NETWORKS)[number];

export type AppConfig = {
  network: SupportedNetwork;
  esploraUrl: string | null;
  explorerUrl: string | null;
};

export const networkSwitchingBuild = import.meta.env.PUBLIC_NETWORK_SWITCHING === 'true';
const configuredNetwork = parseNetwork(
  import.meta.env.PUBLIC_BITCOIN_NETWORK as string | undefined
);

const TXID_PATTERN = /^[0-9a-fA-F]{64}$/;

export const defaultConfig: AppConfig = {
  network: configuredNetwork,
  esploraUrl:
    configuredNetwork === 'signet'
      ? 'https://mempool.space/signet/api'
      : configuredNetwork === 'testnet4'
        ? 'https://mempool.space/testnet4/api'
        : null,
  explorerUrl: explorerUrlForNetwork(configuredNetwork)
};

export function explorerUrlForNetwork(network: SupportedNetwork): string | null {
  if (network === 'mainnet') return 'https://mempool.space';
  if (network === 'signet') return 'https://mempool.space/signet';
  if (network === 'testnet4') return 'https://mempool.space/testnet4';
  return null;
}

export function transactionExplorerUrl(network: SupportedNetwork, txid: string): string | null {
  const explorerUrl = explorerUrlForNetwork(network);
  if (!explorerUrl || !TXID_PATTERN.test(txid)) return null;
  return `${explorerUrl}/tx/${txid.toLowerCase()}`;
}

export function parseNetwork(value: string | undefined): SupportedNetwork {
  if (value && SUPPORTED_NETWORKS.includes(value as SupportedNetwork))
    return value as SupportedNetwork;
  return 'signet';
}

export function applyRuntimeNetwork(network: SupportedNetwork): void {
  defaultConfig.network = network;
  defaultConfig.esploraUrl =
    network === 'signet'
      ? 'https://mempool.space/signet/api'
      : network === 'testnet4'
        ? 'https://mempool.space/testnet4/api'
        : null;
  defaultConfig.explorerUrl = explorerUrlForNetwork(network);
}

export function networkName(network: SupportedNetwork): string {
  return network === 'testnet4' ? 'Testnet4' : network[0].toUpperCase() + network.slice(1);
}
