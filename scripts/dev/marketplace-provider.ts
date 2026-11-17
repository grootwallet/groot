import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

export const providerPort = 5310;
export type ProviderMode = 'fixture' | 'public' | 'account';

export function marketplaceProviderMode(options: {
  command: 'build' | 'serve';
  isPreview?: boolean;
  nativePlatform?: string;
  mode?: string;
}): ProviderMode | undefined {
  if (options.command !== 'serve' || options.isPreview || options.nativePlatform) return;
  if (!options.mode || options.mode === 'off') return;
  if (options.mode === 'fixture' || options.mode === 'public' || options.mode === 'account')
    return options.mode;
  throw new Error('Invalid LocalCoinSwap mode. Use fixture, public, account, or off.');
}

export function marketplaceProviderPlugin(mode: ProviderMode | undefined): Plugin {
  return {
    name: 'groot-localcoinswap',
    apply: 'serve',
    async configureServer(server) {
      if (!mode) return;
      const { host, port, strictPort, https } = server.config.server;
      if (host !== '127.0.0.1' || !port || !strictPort || https)
        throw new Error('LocalCoinSwap development requires a fixed HTTP port on 127.0.0.1.');
      const apiKey = mode === 'account' ? process.env.GROOT_LOCALCOINSWAP_API_KEY : undefined;
      if (mode === 'account' && !apiKey)
        throw new Error('LocalCoinSwap account mode requires a server-side API key.');
      const [{ createLocalCoinSwapProvider }, { createLocalCoinSwapGateway }, fixture] =
        await Promise.all([
          import('../../packages/marketplace/localcoinswap-provider.mjs'),
          import('../../packages/marketplace/localcoinswap-gateway.mjs'),
          mode === 'fixture' ? import('../../packages/marketplace/localcoinswap-fixture.mjs') : null
        ]);
      const provider = createLocalCoinSwapProvider({
        apiKey: fixture?.LOCALCOINSWAP_FIXTURE_KEY ?? apiKey,
        fetcher: fixture?.createLocalCoinSwapFixtureFetch() ?? fetch
      });
      const journalPath = mode === 'account' ? process.env.GROOT_LOCALCOINSWAP_JOURNAL : undefined;
      const gateway = createLocalCoinSwapGateway({
        mode,
        provider,
        origin: `http://127.0.0.1:${port}`,
        accessToken: mode === 'account' ? process.env.GROOT_LOCALCOINSWAP_ACCESS_TOKEN : undefined,
        accountScope: apiKey ? createHash('sha256').update(apiKey).digest('hex') : undefined,
        writeEnabled: mode === 'account' && process.env.GROOT_LOCALCOINSWAP_TRADE_ACTIONS === '1',
        journalPath
      });
      if (journalPath) {
        const journal = realpathSync(journalPath);
        const roots = [
          server.config.root,
          server.config.publicDir,
          ...server.config.server.fs.allow
        ];
        const served = roots.some((root) => {
          if (!root || !existsSync(root)) return false;
          const path = relative(realpathSync(root), journal);
          return (
            path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
          );
        });
        if (served) {
          gateway.close();
          throw new Error('The LocalCoinSwap journal must be outside Vite’s served directories.');
        }
      }
      server.middlewares.use(gateway);
      server.httpServer?.once('close', () => gateway.close());
    }
  };
}
