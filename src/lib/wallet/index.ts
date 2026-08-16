import type { WalletPort } from './contracts';
import { DummyWalletAdapter } from './dummy';
import { TauriWalletAdapter } from './tauri';

export * from './contracts';
export * from './policy';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isPrototypeWallet = !isTauri;
export const walletService: WalletPort = isTauri
  ? new TauriWalletAdapter()
  : new DummyWalletAdapter();
