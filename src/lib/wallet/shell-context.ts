import { getContext, setContext } from 'svelte';
import type { WalletProfile } from './contracts';

const walletShellContextKey = Symbol('wallet-shell-context');

export type WalletShellContext = {
  profiles: () => WalletProfile[];
  selectedWalletId: () => string | null;
  refreshProfiles: () => Promise<void>;
  selectWallet: (walletId: string) => Promise<void>;
  beginHardwareReview: () => () => void;
};

export function provideWalletShellContext(context: WalletShellContext) {
  setContext(walletShellContextKey, context);
}

export function useWalletShellContext() {
  return getContext<WalletShellContext>(walletShellContextKey);
}
