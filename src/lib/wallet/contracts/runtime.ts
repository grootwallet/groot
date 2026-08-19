import type { SupportedNetwork } from '$lib/config';
import type { Sats, WalletSnapshot } from './transactions';

export type MnemonicPresentation =
  { mode: 'native'; backupVerified: boolean } | { mode: 'fixture'; words: string[] };
export type WalletProfile = {
  id: string;
  name: string;
  network: SupportedNetwork;
  kind: 'single_key' | 'multisig' | 'watch_only';
  descriptorChecksum: string;
  createdAt: number;
  backupVerified: boolean;
};
export type WalletRegistry = {
  version: number;
  selectedWalletId: string | null;
  wallets: WalletProfile[];
  inactivityTimeoutMinutes: number;
};
export type WalletSelection = {
  profile: WalletProfile;
  unlocked: boolean;
};
export type WalletProfileCompatibility = {
  supported: boolean;
};
export type CoreNodeConfig = {
  backend: { type: 'local_core' | 'remote_core'; url: string };
  auth: 'cookie' | 'user_pass';
  username: string | null;
  torProxy?: string | null;
};
export type NodeStatus = {
  connected: boolean;
  blocks: number;
  backend: CoreNodeConfig;
  pruned: boolean;
  pruneHeight: number | null;
  initialBlockDownload: boolean;
  sizeOnDisk: number;
  blockFilterIndex: 'synced' | 'building' | 'disabled' | 'unknown';
};
export type WalletSyncSource =
  | { type: 'bitcoin_core' }
  | {
      type: 'compact_filters';
      peers: string[];
      requiredPeers: number;
      discoverPeers: boolean;
      torProxy?: string | null;
    };
export type WalletSyncStatus = {
  walletId: string;
  source: 'bitcoin_core' | 'compact_filters';
  state:
    | 'connecting'
    | 'syncing'
    | 'checking_matches'
    | 'applying'
    | 'completed'
    | 'cancelled'
    | 'failed';
  progressPercent: number | null;
  chainHeight: number | null;
  lastVerifiedHeight: number;
  connectedPeers: number | null;
  requiredPeers: number | null;
  updatedAt: number;
};
export type PayjoinUriInspection = {
  address: string;
  amount: number | null;
  label: string | null;
  message: string | null;
  endpoint: string;
  version: 'v2';
};
export type RecoveryScanSettings = { birthdayHeight: number; gapLimit: number };
export type RecoveryScanStatus = {
  status: 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'interrupted' | 'failed';
  birthdayHeight: number;
  gapLimit: number;
  currentHeight: number;
  targetHeight: number;
  processedBlocks: number;
  totalBlocks: number;
  startedAt: number;
  updatedAt: number;
};
export type SupplementalEntropyInput = { source: 'coin' | 'dice'; outcomes: string };
export const MIN_SUPPLEMENTAL_COIN_FLIPS = 128;
export const MAX_SUPPLEMENTAL_COIN_FLIPS = 256;
export const MIN_SUPPLEMENTAL_DICE_ROLLS = 50;
export const MAX_SUPPLEMENTAL_DICE_ROLLS = 100;

export type WalletEvent =
  | { type: 'payment_received'; txid: string; amount: Sats; balance: Sats }
  | { type: 'payment_received_confirmed'; txid: string; amount: Sats; balance: Sats }
  | { type: 'first_confirmation'; txid: string; balance: Sats }
  | { type: 'transaction_broadcast'; txid: string; balance: Sats }
  | {
      type: 'wallet_updated';
      walletId: string;
      walletKind: WalletProfile['kind'];
      snapshot: WalletSnapshot;
    }
  | { type: 'wallet_profile_updated'; profile: WalletProfile };
