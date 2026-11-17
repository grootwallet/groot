// @ts-check

/**
 * Optional loopback development transport for public offer discovery.
 * This is neither a hosted relay nor an authenticated trading API.
 */
export const DISCOVERY_PATH = '/__groot_marketplace/offers';

const MAX_BODY_BYTES = 512 * 1_024;
const MAX_IN_FLIGHT = 2;
const TIMEOUT_MS = 8_000;
const BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1_000;

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */
/** @typedef {'localcoinswap' | 'hodlhodl'} DiscoveryProvider */
/** @typedef {'provider_unavailable' | 'rate_limited' | 'invalid_response' | 'invalid_request' | 'forbidden' | 'busy'} ErrorCode */

// Shared by all middleware instances in this process; remounting is not a retry bypass.
/** @type {Set<AbortController>} */
const inFlight = new Set();
/** @type {Map<DiscoveryProvider, number>} */
const providerBackoff = new Map();

class DiscoveryError extends Error {
  /** @param {ErrorCode} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** @param {IncomingMessage} request @param {string} name */
function header(request, name) {
  const value = request.headers[name];
  return typeof value === 'string' ? value : value === undefined ? undefined : null;
}

/** @param {IncomingMessage} request */
function isLocalRequest(request) {
  // A non-simple header prevents image/form/drive-by requests when Fetch Metadata is absent.
  // This is a CSRF defense, not authentication or proof of the user's in-page consent.
  if (header(request, 'x-groot-marketplace-request') !== '1') return false;
  if (Array.isArray(request.rawHeaders)) {
    let markers = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index].toLowerCase() === 'x-groot-marketplace-request') markers++;
    }
    if (markers > 1) return false;
  }
  const host = header(request, 'host');
  if (!host) return false;
  const hostMatch = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?$/i.exec(host);
  if (!hostMatch || (hostMatch[1] && Number(hostMatch[1]) > 65_535)) return false;

  const remoteAddress = request.socket?.remoteAddress;
  if (
    remoteAddress &&
    remoteAddress !== '127.0.0.1' &&
    remoteAddress !== '::1' &&
    remoteAddress !== '::ffff:127.0.0.1'
  )
    return false;

  const fetchSite = header(request, 'sec-fetch-site');
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = header(request, 'origin');
  const scheme = 'encrypted' in request.socket && request.socket.encrypted ? 'https' : 'http';
  if (origin !== undefined && origin !== new URL(`${scheme}://${host}`).origin) return false;
  return true;
}

/** @param {ServerResponse} response @param {number} status @param {Record<string, unknown>} payload */
function respond(response, status, payload) {
  if (response.destroyed || response.writableEnded) return;
  for (const name of response.getHeaderNames()) {
    if (name.toLowerCase().startsWith('access-control-')) response.removeHeader(name);
  }
  let body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    status = 502;
    body = JSON.stringify({ code: 'invalid_response' });
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(body);
}

/** @param {ErrorCode} code */
function errorStatus(code) {
  switch (code) {
    case 'invalid_request':
      return 400;
    case 'forbidden':
      return 403;
    case 'rate_limited':
      return 429;
    case 'busy':
    case 'provider_unavailable':
      return 503;
    case 'invalid_response':
      return 502;
  }
}

/** @param {string | null} value @param {number} nowMs */
function retryAfterDeadline(value, nowMs) {
  let delay = BACKOFF_MS;
  if (value && /^[0-9]{1,10}$/.test(value)) {
    delay = Number(value) * 1_000;
  } else if (value && /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) delay = parsed - nowMs;
  }
  // Preserve the original minimum cooldown; a provider may ask for a longer bounded wait.
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    nowMs + Math.max(BACKOFF_MS, Math.min(delay, MAX_BACKOFF_MS))
  );
}

/** @template T @param {Promise<T>} promise @param {AbortSignal} signal @returns {Promise<T>} */
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DiscoveryError('provider_unavailable'));
    if (signal.aborted) {
      onAbort();
      // Observe a possible later rejection from a transport which ignored cancellation.
      void promise.catch(() => {});
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/** @param {Response} response @param {AbortSignal} signal @param {DiscoveryProvider} provider @returns {Promise<Record<string, unknown>>} */
async function readPublicJson(response, signal, provider) {
  const type = response.headers.get('content-type');
  if (!type || !/^application\/json(?:\s*;\s*charset\s*=\s*"?(?:utf-8|utf8)"?)?\s*$/i.test(type))
    throw new DiscoveryError('invalid_response');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^(?:0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_BODY_BYTES))
    throw new DiscoveryError('invalid_response');
  if (!response.body) throw new DiscoveryError('invalid_response');

  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  let complete = false;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new DiscoveryError('invalid_response');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const payload = JSON.parse(text);
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
      throw new DiscoveryError('invalid_response');
    if (provider === 'hodlhodl') {
      if (
        payload.status !== 'success' ||
        !Array.isArray(payload.offers) ||
        payload.offers.length > 100
      )
        throw new DiscoveryError('invalid_response');
    } else if (
      !Array.isArray(payload.results) ||
      payload.results.length > 100 ||
      !Number.isSafeInteger(payload.count) ||
      payload.count < 0 ||
      (payload.limit !== undefined &&
        (!Number.isSafeInteger(payload.limit) || payload.limit < 1 || payload.limit > 100))
    ) {
      throw new DiscoveryError('invalid_response');
    }
    complete = true;
    return payload;
  } catch (error) {
    if (error instanceof DiscoveryError) throw error;
    throw new DiscoveryError('invalid_response');
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

/** @param {string} rawUrl @param {DiscoveryProvider} provider */
function providerUrl(rawUrl, provider) {
  if (rawUrl.length > 512 || rawUrl.includes('#')) throw new DiscoveryError('invalid_request');
  if (rawUrl.split('?')[0] !== DISCOVERY_PATH) throw new DiscoveryError('invalid_request');
  const url = new URL(rawUrl, 'http://localhost');
  if (url.pathname !== DISCOVERY_PATH) throw new DiscoveryError('invalid_request');
  const params = url.searchParams;
  if (
    params.size !== 2 ||
    params.getAll('intent').length !== 1 ||
    params.getAll('amountCents').length !== 1
  )
    throw new DiscoveryError('invalid_request');
  const intent = params.get('intent');
  const amount = params.get('amountCents');
  if (
    (intent !== 'buy' && intent !== 'sell') ||
    !amount ||
    !/^[1-9][0-9]{3,4}$/.test(amount) ||
    Number(amount) < 5_000 ||
    Number(amount) > 25_000
  )
    throw new DiscoveryError('invalid_request');

  if (provider === 'localcoinswap') {
    const target = new URL('/api/v2/offers/search/', 'https://api.localcoinswap.com');
    target.searchParams.set('coin_currency', 'BTC');
    target.searchParams.set('fiat_currency', 'EUR');
    target.searchParams.set('trading_type', intent === 'buy' ? 'sell' : 'buy');
    target.searchParams.set('payment_method', 'sepa-instant');
    target.searchParams.set('last_seen', '30mins');
    target.searchParams.set('limit', '100');
    target.searchParams.set('offset', '0');
    // No documented amount filter: retain the validated amount in the local client only.
    return target.href;
  }

  const target = new URL('/api/v1/offers', 'https://hodlhodl.com');
  target.searchParams.set('pagination[limit]', '100');
  target.searchParams.set('pagination[offset]', '0');
  target.searchParams.set('filters[asset_code]', 'BTC');
  target.searchParams.set('filters[currency_code]', 'EUR');
  target.searchParams.set('filters[side]', intent === 'buy' ? 'sell' : 'buy');
  target.searchParams.set('filters[payment_method_id]', '9081');
  target.searchParams.set('filters[only_working_now]', 'true');
  const cents = BigInt(amount);
  target.searchParams.set(
    'filters[amount]',
    `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
  );
  return target.href;
}

/**
 * No network request occurs until this handler receives an explicit valid search.
 * The caller owns mounting only in an opted-in, non-native Vite development server.
 * Provider choice is explicit development configuration, never a caller-controlled fallback.
 * @param {{ provider?: DiscoveryProvider, fetch?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [options]
 */
export function createDiscoveryMiddleware(options = {}) {
  const provider = options.provider ?? 'localcoinswap';
  if (provider !== 'localcoinswap' && provider !== 'hodlhodl')
    throw new RangeError('Invalid discovery provider.');
  const fetchPublic = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS)
    throw new RangeError('Invalid discovery timeout.');
  /** @type {Set<AbortController>} */
  const owned = new Set();
  let closed = false;

  /** @param {IncomingMessage} request @param {ServerResponse} response @param {() => void} [next] */
  async function handle(request, response, next) {
    const rawUrl = request.url ?? '';
    const path = rawUrl.split('?')[0];
    if (path !== '/__groot_marketplace' && !path.startsWith('/__groot_marketplace/')) {
      next?.();
      return;
    }

    /** @type {AbortController | undefined} */
    let controller;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    let disconnected = false;
    const disconnect = () => {
      disconnected = true;
      controller?.abort();
    };
    const responseClose = () => {
      if (!response.writableEnded) disconnect();
    };
    try {
      if (request.aborted || response.destroyed || response.writableEnded) return;
      if (!isLocalRequest(request)) throw new DiscoveryError('forbidden');
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        respond(response, 405, { code: 'invalid_request' });
        return;
      }
      const target = providerUrl(rawUrl, provider);
      if (closed) throw new DiscoveryError('provider_unavailable');
      if (now() < (providerBackoff.get(provider) ?? 0)) throw new DiscoveryError('rate_limited');
      providerBackoff.delete(provider);
      if (inFlight.size >= MAX_IN_FLIGHT) throw new DiscoveryError('busy');

      controller = new AbortController();
      owned.add(controller);
      inFlight.add(controller);
      request.once('aborted', disconnect);
      response.once('close', responseClose);
      timer = setTimeout(() => controller?.abort(), timeoutMs);
      const upstream = await abortable(
        fetchPublic(target, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          signal: controller.signal
        }).then((lateResponse) => {
          if (controller?.signal.aborted) {
            void lateResponse.body?.cancel().catch(() => {});
            throw new DiscoveryError('provider_unavailable');
          }
          return lateResponse;
        }),
        controller.signal
      );
      try {
        if (upstream.redirected || (upstream.url && upstream.url !== target))
          throw new DiscoveryError('invalid_response');
        if (upstream.status === 429) {
          providerBackoff.set(
            provider,
            Math.max(
              providerBackoff.get(provider) ?? 0,
              retryAfterDeadline(upstream.headers.get('retry-after'), now())
            )
          );
          throw new DiscoveryError('rate_limited');
        }
        if (upstream.status !== 200) throw new DiscoveryError('provider_unavailable');
        const payload = await readPublicJson(upstream, controller.signal, provider);
        if (controller.signal.aborted) throw new DiscoveryError('provider_unavailable');
        respond(response, 200, { provider, payload });
      } finally {
        if (upstream.body && !upstream.body.locked) void upstream.body.cancel().catch(() => {});
      }
    } catch (error) {
      const code = error instanceof DiscoveryError ? error.code : 'provider_unavailable';
      if (!disconnected) {
        if (code === 'rate_limited')
          response.setHeader(
            'Retry-After',
            String(
              Math.max(1, Math.ceil(((providerBackoff.get(provider) ?? now()) - now()) / 1_000))
            )
          );
        respond(response, errorStatus(code), { code });
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      request.removeListener('aborted', disconnect);
      response.removeListener('close', responseClose);
      if (controller) {
        owned.delete(controller);
        inFlight.delete(controller);
      }
    }
  }

  return Object.assign(handle, {
    close() {
      closed = true;
      for (const controller of owned) controller.abort();
    }
  });
}
