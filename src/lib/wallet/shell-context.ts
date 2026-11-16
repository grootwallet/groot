import { getContext, setContext } from 'svelte';
import type { WalletProfile } from './contracts';
import type { MobileQuickActionSnapshot } from './mobile-quick-actions';

const walletShellContextKey = Symbol('wallet-shell-context');

export type WalletShellContext = {
  profiles: () => WalletProfile[];
  selectedWalletId: () => string | null;
  refreshProfiles: () => Promise<void>;
  selectWallet: (walletId: string) => Promise<void>;
  lockSelectedWallet: () => Promise<void>;
  beginHardwareReview: () => () => void;
  requestInitialHistoryApproval: (force?: boolean) => void;
  reportMobileQuickActionSnapshot: (
    walletId: string,
    snapshot: MobileQuickActionSnapshot | null
  ) => void;
  initialHistoryScanRunning: (walletId: string) => boolean;
  requestUnlockSync: (walletId: string) => void;
  consumeUnlockSync: (walletId: string) => boolean;
  pauseAutomaticSync: () => Promise<void>;
  resumeAutomaticSync: () => void;
};

export function provideWalletShellContext(context: WalletShellContext) {
  setContext(walletShellContextKey, context);
}

export function useWalletShellContext() {
  return getContext<WalletShellContext>(walletShellContextKey);
}
