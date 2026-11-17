import type { Plugin } from 'vite';
import { createDiscoveryMiddleware } from '../../packages/marketplace/discovery-server.mjs';

export function marketplaceDiscoveryEnabled(options: {
  command: 'build' | 'serve';
  isPreview?: boolean;
  nativePlatform?: string;
  flag?: string;
}): boolean {
  return (
    options.command === 'serve' &&
    !options.isPreview &&
    !options.nativePlatform &&
    options.flag === '1'
  );
}

/** Local development only. Packaged/native/preview servers never install the relay. */
export function marketplaceDiscoveryPlugin(enabled: boolean): Plugin {
  return {
    name: 'groot-local-marketplace-discovery',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      const middleware = createDiscoveryMiddleware();
      server.middlewares.use(middleware);
      server.httpServer?.once('close', () => middleware.close());
    }
  };
}
