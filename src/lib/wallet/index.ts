import type { WalletPort } from './contracts';
import { DummyWalletAdapter } from './dummy';
import { TauriWalletAdapter } from './tauri';

export * from './contracts';
export * from './policy';

export const isPrototypeWallet = !__GROOT_NATIVE_UI__;
export const walletService: WalletPort = __GROOT_NATIVE_UI__
  ? new TauriWalletAdapter()
  : new DummyWalletAdapter();
