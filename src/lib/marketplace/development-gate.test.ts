import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from 'vite';
import configuration from '../../../vite.config';
import {
  marketplaceDiscoveryEnabled,
  marketplaceDiscoveryPlugin
} from '../../../scripts/dev/marketplace-discovery';
import { createDiscoveryMiddleware } from '../../../packages/marketplace/discovery-server.mjs';

vi.mock('@sveltejs/kit/vite', () => ({ sveltekit: () => ({ name: 'test-sveltekit' }) }));
vi.mock('../../../packages/marketplace/discovery-server.mjs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/marketplace/discovery-server.mjs')>();
  return { ...actual, createDiscoveryMiddleware: vi.fn(actual.createDiscoveryMiddleware) };
});

type Middleware = ReturnType<typeof createDiscoveryMiddleware>;
const owned: Middleware[] = [];
let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

beforeEach(() => {
  vi.clearAllMocks();
  fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('GROOT_MARKETPLACE_DISCOVERY', undefined);
  vi.stubEnv('TAURI_ENV_PLATFORM', undefined);
});

afterEach(() => {
  for (const middleware of owned.splice(0)) middleware.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function start(plugin: Plugin, httpServer: EventEmitter | null = new EventEmitter()) {
  const use = vi.fn();
  const server = { middlewares: { use }, httpServer } as unknown as ViteDevServer;
  const configure = plugin.configureServer;
  if (typeof configure !== 'function') throw new Error('Expected the development-server hook.');
  await configure.call({} as never, server);
  const middleware = use.mock.calls[0]?.[0] as Middleware | undefined;
  if (middleware) owned.push(middleware);
  return { use, middleware, httpServer };
}

function requestAndResponse(url = '/__groot_marketplace/offers?intent=buy&amountCents=10000') {
  const request = Object.assign(new EventEmitter(), {
    url,
    method: 'GET',
    headers: {
      host: '127.0.0.1:5188',
      'sec-fetch-site': 'same-origin',
      'x-groot-marketplace-request': '1'
    },
    socket: { remoteAddress: '127.0.0.1' },
    aborted: false
  }) as unknown as IncomingMessage;
  const result: { status: number; body: string; headers: Map<string, string> } = {
    status: 0,
    body: '',
    headers: new Map()
  };
  const response = Object.assign(new EventEmitter(), {
    statusCode: 0,
    destroyed: false,
    writableEnded: false,
    getHeaderNames() {
      return [...result.headers.keys()];
    },
    removeHeader(name: string) {
      result.headers.delete(name);
    },
    setHeader(name: string, value: string) {
      result.headers.set(name, value);
    },
    end(body: string) {
      result.status = this.statusCode;
      result.body = body;
      this.writableEnded = true;
    }
  }) as unknown as ServerResponse;
  return { request, response, result };
}

async function configuredPlugin(env: Partial<ConfigEnv> = {}) {
  const input: ConfigEnv = { command: 'serve', mode: 'development', isPreview: false, ...env };
  const result: UserConfig =
    typeof configuration === 'function' ? await configuration(input) : await configuration;
  const plugin = (result.plugins ?? []).find(
    (candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      'name' in candidate &&
      candidate.name === 'groot-local-marketplace-discovery'
  ) as Plugin | undefined;
  if (!plugin) throw new Error('Expected the optional development plugin.');
  return { plugin, config: result };
}

describe('marketplace development gate', () => {
  it.each([
    [{ command: 'serve' }, false],
    [{ command: 'serve', flag: '0' }, false],
    [{ command: 'serve', flag: 'true' }, false],
    [{ command: 'serve', flag: ' 1' }, false],
    [{ command: 'serve', flag: '1' }, true],
    [{ command: 'serve', flag: '1', isPreview: true }, false],
    [{ command: 'build', flag: '1' }, false],
    [{ command: 'serve', flag: '1', nativePlatform: 'macos' }, false],
    [{ command: 'serve', flag: '1', nativePlatform: 'ios' }, false],
    [{ command: 'serve', flag: '1', nativePlatform: 'android' }, false]
  ] as const)(
    'requires an exact opt-in and an ordinary browser dev server: %j',
    (options, expected) => {
      expect(marketplaceDiscoveryEnabled(options)).toBe(expected);
      expect(createDiscoveryMiddleware).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('actual Vite config defaults off without even constructing transport', async () => {
    const { plugin, config } = await configuredPlugin();
    const { use } = await start(plugin);
    expect(config.define?.__GROOT_MARKETPLACE_DISCOVERY__).toBe('false');
    expect(use).not.toHaveBeenCalled();
    expect(createDiscoveryMiddleware).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('public/client-prefixed variables cannot silently opt into transport', async () => {
    vi.stubEnv('PUBLIC_GROOT_MARKETPLACE_DISCOVERY', '1');
    vi.stubEnv('VITE_GROOT_MARKETPLACE_DISCOVERY', '1');
    const { plugin, config } = await configuredPlugin();
    const { use } = await start(plugin);
    expect(config.define?.__GROOT_MARKETPLACE_DISCOVERY__).toBe('false');
    expect(use).not.toHaveBeenCalled();
    expect(createDiscoveryMiddleware).not.toHaveBeenCalled();
  });

  it.each(['macos', 'windows', 'linux', 'ios', 'android'])(
    'actual native %s Vite config overrides the development opt-in',
    async (platform) => {
      vi.stubEnv('TAURI_ENV_PLATFORM', platform);
      vi.stubEnv('GROOT_MARKETPLACE_DISCOVERY', '1');
      const { plugin, config } = await configuredPlugin();
      const { use } = await start(plugin);
      expect(config.define?.__GROOT_NATIVE_UI__).toBe('true');
      expect(config.define?.__GROOT_MARKETPLACE_DISCOVERY__).toBe('false');
      expect(use).not.toHaveBeenCalled();
      expect(createDiscoveryMiddleware).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each(['production', 'mainnet', 'multi', 'signet', 'testnet4'])(
    'actual %s build config overrides the development opt-in',
    async (mode) => {
      vi.stubEnv('GROOT_MARKETPLACE_DISCOVERY', '1');
      const { plugin, config } = await configuredPlugin({ command: 'build', mode });
      const { use } = await start(plugin);
      expect(config.define?.__GROOT_MARKETPLACE_DISCOVERY__).toBe('false');
      expect(plugin.apply).toBe('serve');
      expect(use).not.toHaveBeenCalled();
      expect(createDiscoveryMiddleware).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('actual preview config has no compiled enablement or preview-server middleware hook', async () => {
    vi.stubEnv('GROOT_MARKETPLACE_DISCOVERY', '1');
    const { plugin, config } = await configuredPlugin({ isPreview: true, mode: 'production' });
    expect(config.define?.__GROOT_MARKETPLACE_DISCOVERY__).toBe('false');
    expect(plugin.configurePreviewServer).toBeUndefined();
    expect((await start(plugin)).use).not.toHaveBeenCalled();
    expect(createDiscoveryMiddleware).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('mounting an explicitly enabled browser server still makes no provider request', async () => {
    vi.stubEnv('GROOT_MARKETPLACE_DISCOVERY', '1');
    const { plugin, config } = await configuredPlugin();
    const { use, middleware } = await start(plugin);
    expect(config.define?.__GROOT_MARKETPLACE_DISCOVERY__).toBe('true');
    expect(plugin.apply).toBe('serve');
    expect(plugin.configurePreviewServer).toBeUndefined();
    expect(createDiscoveryMiddleware).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledTimes(1);
    expect(middleware).toBeTypeOf('function');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ordinary route visits fall through the installed middleware without provider access', async () => {
    const { middleware } = await start(marketplaceDiscoveryPlugin(true));
    if (!middleware) throw new Error('Missing enabled middleware.');
    for (const path of ['/', '/marketplace', '/marketplace/discover', '/settings', '/unlock']) {
      const { request, response, result } = requestAndResponse(path);
      const next = vi.fn();
      await middleware(request, response, next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.status).toBe(0);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('the server close event aborts outstanding transport even when fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    fetch.mockReturnValue(new Promise(() => {}));
    const { middleware, httpServer } = await start(marketplaceDiscoveryPlugin(true));
    if (!middleware || !httpServer) throw new Error('Missing enabled server.');
    const { request, response, result } = requestAndResponse();
    const pending = middleware(request, response);
    expect(fetch).toHaveBeenCalledOnce();
    const signal = fetch.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    httpServer.emit('close');
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ code: 'provider_unavailable' });
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a closed development server cannot start another request through its old handler', async () => {
    const { middleware, httpServer } = await start(marketplaceDiscoveryPlugin(true));
    if (!middleware || !httpServer) throw new Error('Missing enabled server.');
    httpServer.emit('close');
    const { request, response, result } = requestAndResponse();
    await middleware(request, response);
    expect(result.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
