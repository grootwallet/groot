import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compositionRoot = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');

describe('wallet composition root', () => {
  it('selects the native adapter at build time for Tauri bundles', () => {
    expect(viteConfig).toContain(
      '__GROOT_NATIVE_UI__: JSON.stringify(Boolean(process.env.TAURI_ENV_PLATFORM))'
    );
    expect(compositionRoot).toContain(
      'export const walletService: WalletPort = __GROOT_NATIVE_UI__'
    );
    expect(compositionRoot).not.toContain("'__TAURI_INTERNALS__' in window");
  });

  it('keeps the standalone browser build on the deterministic prototype adapter', () => {
    expect(compositionRoot).toContain('export const isPrototypeWallet = !__GROOT_NATIVE_UI__');
    expect(compositionRoot).toContain(': new DummyWalletAdapter()');
  });
});
