import {
  marketplaceBackendEnabled,
  marketplaceBackendPort,
  marketplaceSandboxBuildEnabled
} from './scripts/dev/marketplace-backend';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import {
  marketplaceDiscoveryEnabled,
  marketplaceDiscoveryPlugin
} from './scripts/dev/marketplace-discovery';
import {
  marketplaceProviderMode,
  marketplaceProviderPlugin,
  providerPort
} from './scripts/dev/marketplace-provider';

export default defineConfig(({ command, isPreview, mode }) => {
  const provider = marketplaceProviderMode({
    command,
    isPreview,
    nativePlatform: process.env.TAURI_ENV_PLATFORM,
    mode: process.env.GROOT_LOCALCOINSWAP_MODE
  });
  const discovery =
    !provider &&
    marketplaceDiscoveryEnabled({
      command,
      isPreview,
      nativePlatform: process.env.TAURI_ENV_PLATFORM,
      flag: process.env.GROOT_MARKETPLACE_DISCOVERY
    });
  const backend =
    !provider &&
    marketplaceBackendEnabled({
      command,
      isPreview,
      nativePlatform: process.env.TAURI_ENV_PLATFORM,
      flag: process.env.GROOT_MARKETPLACE_BACKEND
    });
  const sandboxBuild = marketplaceSandboxBuildEnabled({
    command,
    mode,
    nativePlatform: process.env.TAURI_ENV_PLATFORM,
    flag: process.env.GROOT_MARKETPLACE_SANDBOX_BUILD
  });
  return {
    ...(process.env.GROOT_VITE_CACHE_DIR ? { cacheDir: process.env.GROOT_VITE_CACHE_DIR } : {}),
    plugins: [
      marketplaceDiscoveryPlugin(discovery),
      marketplaceProviderPlugin(provider),
      sveltekit()
    ],
    ...(sandboxBuild ? { envDir: false as const } : {}),
    define: {
      __GROOT_NATIVE_UI__: JSON.stringify(Boolean(process.env.TAURI_ENV_PLATFORM)),
      __GROOT_MARKETPLACE_DISCOVERY__: JSON.stringify(discovery),
      __GROOT_LOCALCOINSWAP__: JSON.stringify(Boolean(provider)),
      __GROOT_MARKETPLACE_BACKEND__: JSON.stringify(backend || sandboxBuild),
      __GROOT_MARKETPLACE_SANDBOX_SITE__: JSON.stringify(sandboxBuild),
      ...(sandboxBuild
        ? {
            'import.meta.env.PUBLIC_BITCOIN_NETWORK': JSON.stringify('regtest'),
            'import.meta.env.PUBLIC_NETWORK_SWITCHING': JSON.stringify('false')
          }
        : {})
    },
    envPrefix: ['VITE_', 'PUBLIC_'],
    server: {
      host: '127.0.0.1',
      port: provider ? providerPort : 5188,
      strictPort: true,
      ...(backend
        ? {
            proxy: {
              '/v1': {
                target: `http://127.0.0.1:${marketplaceBackendPort(process.env.GROOT_MARKETPLACE_PROXY_PORT)}`,
                changeOrigin: true
              }
            }
          }
        : {})
    },
    test: { include: ['src/**/*.test.ts'], exclude: ['e2e/**'] }
  };
});
