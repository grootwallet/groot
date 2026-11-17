import { createHash, timingSafeEqual } from 'node:crypto';
import { createLocalCoinSwapJournal } from './localcoinswap-journal.mjs';
import { isLocalCoinSwapTransactionType } from './localcoinswap-provider.mjs';

export const LOCALCOINSWAP_API_BASE = '/api/marketplace/localcoinswap';

const MAX_BODY_BYTES = 8192;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const LOOPBACK_PEER = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = new Set([
  'host',
  'origin',
  'authorization',
  'x-groot-localcoinswap',
  'sec-fetch-site',
  'content-type',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'idempotency-key'
]);
const ACTION_STATUS = Object.freeze({
  mark_paid: ['CRYPTO_ESC'],
  cancel_unfunded: ['CREATED'],
  open_dispute: ['CRYPTO_ESC', 'FUND_PAID'],
  withdraw_dispute: ['DISPUTED']
});

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */
/** @typedef {{code:string,retryable:boolean,retryAfterSeconds?:number}} ErrorBody */
/** @typedef {{intent:'buy'|'sell',country?:string,limit:number,offset:number}} OfferSearch */
/** @typedef {{limit:number,offset:number}} Pagination */
/** @typedef {{stage:'live'|'past',limit:number,offset:number}} TradeSearch */
/** @typedef {Pagination & {type?:string}} TransactionSearch */
/** @typedef {{items:{active:boolean,minFiatCents:number,maxFiatCents:number}[],nextOffset:number|null,total:number}} OfferPage */
/** @typedef {{
 * searchOffers(query:OfferSearch,signal:AbortSignal):Promise<OfferPage>,
 * getOffer(id:string,signal:AbortSignal):Promise<unknown>,
 * listTrades(query:TradeSearch,signal:AbortSignal):Promise<unknown>,
 * getTrade(id:string,signal:AbortSignal):Promise<{id:string,status:string}>,
 * listTransactions(query:TransactionSearch,signal:AbortSignal):Promise<unknown>,
 * listMessages(id:string,page:Pagination,signal:AbortSignal):Promise<unknown>,
 * listLatestMessages(id:string,page:{limit:number},signal:AbortSignal):Promise<unknown>,
 * sendMessage(id:string,content:string,signal:AbortSignal):Promise<unknown>,
 * markPaid(id:string,signal:AbortSignal):Promise<unknown>,
 * cancelUnfunded(id:string,signal:AbortSignal):Promise<unknown>,
 * openDispute(id:string,description:string,signal:AbortSignal):Promise<unknown>,
 * withdrawDispute(id:string,signal:AbortSignal):Promise<unknown>
 * }} Provider */

class GatewayError extends Error {
  /**
   * @param {string} code @param {number} status @param {boolean} [retryable]
   * @param {number} [retryAfterSeconds]
   */
  constructor(code, status, retryable = false, retryAfterSeconds) {
    super(code);
    this.status = status;
    /** @type {ErrorBody} */
    this.body = {
      code,
      retryable,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds })
    };
  }
}

function invalid() {
  return new GatewayError('invalid_request', 400);
}

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} error */
function upstreamError(error) {
  if (error instanceof GatewayError) return error;
  if (object(error)) {
    const status = error.status;
    if (status === 429) {
      const delay = error.retryAfterSeconds;
      return new GatewayError(
        'rate_limited',
        429,
        true,
        typeof delay === 'number' && Number.isSafeInteger(delay) && delay > 0
          ? Math.min(86_400, delay)
          : 60
      );
    }
    if (status === 401) return new GatewayError('provider_unauthenticated', 401);
    if (status === 403) return new GatewayError('provider_forbidden', 403);
    if (status === 404) return new GatewayError('not_found', 404);
    if (status === 400 || status === 422) return new GatewayError('provider_rejected', 422);
    if (status === 409) return new GatewayError('conflict', 409);
    if (error.code === 'invalid_response' || error.code === 'invalid_provider_response')
      return new GatewayError('invalid_provider_response', 502);
  }
  return new GatewayError('unavailable', 503, true);
}

/** @param {ServerResponse} response @param {number} status @param {Record<string,unknown>} payload */
function send(response, status, payload) {
  if (response.destroyed || response.writableEnded) return;
  let text = JSON.stringify({ apiVersion: 1, ...payload });
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    status = 502;
    text = JSON.stringify({
      apiVersion: 1,
      error: { code: 'invalid_provider_response', retryable: false }
    });
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  for (const header of response.getHeaderNames())
    if (header.toLowerCase().startsWith('access-control-')) response.removeHeader(header);
  response.end(text);
}

/** @param {IncomingMessage} request @param {URL} origin */
function checkLocal(request, origin) {
  const seen = new Set();
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const name = request.rawHeaders[i].toLowerCase();
    if (!HEADERS.has(name)) continue;
    if (seen.has(name)) throw invalid();
    seen.add(name);
  }
  const site = request.headers['sec-fetch-site'];
  const suppliedOrigin = request.headers.origin;
  if (
    request.headers.host !== origin.host ||
    !LOOPBACK_PEER.has(request.socket.remoteAddress ?? '') ||
    request.headers['x-groot-localcoinswap'] !== '1' ||
    (site !== undefined && site !== 'same-origin' && site !== 'none') ||
    (suppliedOrigin !== undefined && suppliedOrigin !== origin.origin) ||
    (request.method === 'POST' && suppliedOrigin !== origin.origin)
  )
    throw new GatewayError('forbidden', 403);
  if (
    request.method === 'GET' &&
    (request.headers['transfer-encoding'] !== undefined ||
      (request.headers['content-length'] !== undefined &&
        request.headers['content-length'] !== '0'))
  )
    throw invalid();
}

/** @param {string} value */
function hash(value) {
  return createHash('sha256').update(value).digest();
}

/** @param {URLSearchParams} params @param {string[]} allowed */
function exactQuery(params, allowed) {
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key) || !allowed.includes(key)) throw invalid();
    seen.add(key);
  }
}

/** @param {URLSearchParams} params @param {string} key @param {number} min @param {number} max @param {number} [fallback] */
function queryInt(params, key, min, max, fallback) {
  const text = params.get(key);
  if (text === null && fallback !== undefined) return fallback;
  if (text === null || !/^(0|[1-9][0-9]{0,7})$/.test(text)) throw invalid();
  const value = Number(text);
  if (value < min || value > max) throw invalid();
  return value;
}

/** @param {URLSearchParams} params */
function pagination(params) {
  return {
    limit: queryInt(params, 'limit', 1, 100, 20),
    offset: queryInt(params, 'offset', 0, 10_000, 0)
  };
}

/** @param {unknown} id @returns {string} */
function identifier(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw invalid();
  return id.toLowerCase();
}

/** @param {unknown} value @returns {string} */
function textInput(value) {
  if (typeof value !== 'string') throw invalid();
  const normalized = value.replace(/\r\n?/g, '\n');
  if (
    !normalized.trim() ||
    normalized.length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(
      normalized
    )
  )
    throw invalid();
  return normalized;
}

/** @param {Record<string,unknown>} value @param {string[]} required */
function exactBody(value, required) {
  if (
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw invalid();
}

/** @param {string} input */
function parseJson(input) {
  /** @type {unknown} */
  const value = JSON.parse(input);
  if (!object(value)) throw invalid();
  // Bodies are flat objects. Reject duplicate member names before using the parsed result.
  let depth = 0;
  let previous = '';
  const keys = new Set();
  for (const [token] of input.matchAll(/"(?:\\.|[^"\\])*"|\S/gsu)) {
    if (token === '{' || token === '[') depth++;
    if (token === '}' || token === ']') depth--;
    if (token === ':' && depth === 1) {
      const key = JSON.parse(previous);
      if (keys.has(key)) throw invalid();
      keys.add(key);
    }
    previous = token;
  }
  return value;
}

/** @param {IncomingMessage} request @param {AbortSignal} signal @returns {Promise<Record<string,unknown>>} */
function readBody(request, signal) {
  const contentType = request.headers['content-type'];
  const encoding = request.headers['content-encoding'];
  if (
    !contentType ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType) ||
    (encoding !== undefined && encoding !== 'identity')
  )
    throw new GatewayError('unsupported_media_type', 415);
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d{1,8}$/.test(length) || Number(length) > MAX_BODY_BYTES))
    throw new GatewayError('payload_too_large', 413);

  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let bytes = 0;
    let settled = false;
    /** @param {GatewayError|null} error @param {Record<string,unknown>} [value] */
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('aborted', abort);
      request.removeListener('error', abort);
      if (error) {
        request.once('error', () => {});
        request.resume();
        reject(error);
      } else resolve(value ?? {});
    };
    /** @param {Buffer} chunk */
    const onData = (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > MAX_BODY_BYTES) finish(new GatewayError('payload_too_large', 413));
      else chunks.push(chunk);
    };
    const onEnd = () => {
      try {
        finish(
          null,
          parseJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
        );
      } catch {
        finish(invalid());
      }
    };
    const abort = () => finish(new GatewayError('unavailable', 503, true));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('aborted', abort);
    request.once('error', abort);
  });
}

function unknownOperation() {
  return new GatewayError('operation_unknown', 409);
}

/**
 * @param {{
 * mode:'fixture'|'public'|'account',provider:Provider,origin:string,
 * accessToken?:string,writeEnabled?:boolean,journalPath?:string,accountScope?:string
 * }} config
 */
export function createLocalCoinSwapGateway({
  mode,
  provider,
  origin,
  accessToken,
  writeEnabled = false,
  journalPath,
  accountScope
}) {
  const originUrl = new URL(origin);
  if (
    !['fixture', 'public', 'account'].includes(mode) ||
    origin !== originUrl.origin ||
    !['http:', 'https:'].includes(originUrl.protocol) ||
    !LOOPBACK.has(originUrl.hostname) ||
    typeof writeEnabled !== 'boolean'
  )
    throw new Error('Invalid LocalCoinSwap loopback gateway configuration.');
  if (mode === 'account' && (!accessToken || !/^[A-Za-z0-9_-]{32,256}$/.test(accessToken)))
    throw new Error('Account mode requires a local access token.');
  if (mode === 'account' && writeEnabled && !journalPath)
    throw new Error('Account writes require a durable journal path.');
  if (mode === 'account' && journalPath && !/^[0-9a-f]{64}$/.test(accountScope ?? ''))
    throw new Error('An account journal requires an upstream credential scope.');

  const canWrite = mode === 'fixture' || (mode === 'account' && writeEnabled);
  const journal =
    mode === 'fixture' || (mode === 'account' && journalPath)
      ? createLocalCoinSwapJournal(journalPath)
      : null;
  const expectedToken = accessToken ? hash('Bearer ' + accessToken) : null;
  const scope = mode === 'account' ? (accountScope ?? 'account') : mode;
  /** @type {Set<AbortController>} */
  const activeRequests = new Set();
  let closed = false;
  let journalClosed = false;

  function closeJournalIfIdle() {
    if (closed && !journalClosed && activeRequests.size === 0) {
      journalClosed = true;
      journal?.close();
    }
  }

  /** @param {IncomingMessage} request */
  function authenticated(request) {
    if (mode === 'fixture') return true;
    const supplied = request.headers.authorization;
    return (
      mode === 'account' &&
      expectedToken !== null &&
      typeof supplied === 'string' &&
      supplied.length <= 263 &&
      timingSafeEqual(expectedToken, hash(supplied))
    );
  }

  /** @param {ServerResponse} response @param {string} allow */
  function methodNotAllowed(response, allow) {
    response.setHeader('Allow', allow);
    throw new GatewayError('method_not_allowed', 405);
  }

  /** @param {IncomingMessage} request @param {ServerResponse} response @param {string} tradeId
   * @param {'messages'|'actions'} kind @param {AbortSignal} signal */
  async function write(request, response, tradeId, kind, signal) {
    if (!canWrite || !journal) throw new GatewayError('writes_disabled', 403);
    const key = identifier(request.headers['idempotency-key']);
    const body = await readBody(request, signal);
    /** @type {string|undefined} */
    let message;
    /** @type {keyof typeof ACTION_STATUS|undefined} */
    let action;
    /** @type {string|undefined} */
    let expectedStatus;
    /** @type {string|undefined} */
    let description;
    if (kind === 'messages') {
      exactBody(body, ['content']);
      message = textInput(body.content);
    } else {
      const rawAction = body.action;
      if (
        rawAction !== 'mark_paid' &&
        rawAction !== 'cancel_unfunded' &&
        rawAction !== 'open_dispute' &&
        rawAction !== 'withdraw_dispute'
      )
        throw invalid();
      action = rawAction;
      exactBody(
        body,
        action === 'open_dispute'
          ? ['action', 'expectedStatus', 'description']
          : ['action', 'expectedStatus']
      );
      if (typeof body.expectedStatus !== 'string' || !/^[A-Z_]{1,64}$/.test(body.expectedStatus))
        throw invalid();
      expectedStatus = body.expectedStatus;
      if (action === 'open_dispute') description = textInput(body.description);
    }
    const digest = hash(
      JSON.stringify([kind, tradeId, message, action, expectedStatus, description])
    ).toString('hex');
    const receipt = journal.reserve({ key, scope, digest, effect: action ?? digest, tradeId });
    if (receipt.status === 'conflict') throw new GatewayError('conflict', 409);
    if (receipt.status === 'unknown') throw unknownOperation();
    if (receipt.status === 'pending') throw new GatewayError('operation_pending', 409);
    if (receipt.status === 'succeeded') {
      send(response, kind === 'messages' ? 201 : 200, { data: receipt.data });
      return;
    }
    if (receipt.status === 'rejected') {
      if (receipt.error?.retryAfterSeconds !== undefined && !response.destroyed)
        response.setHeader('Retry-After', String(receipt.error.retryAfterSeconds));
      send(response, receipt.httpStatus ?? 503, { error: receipt.error });
      return;
    }
    let attempted = false;
    /** @type {unknown} */
    let data;
    try {
      if (action) {
        const current = await provider.getTrade(tradeId, signal);
        if (current.id !== tradeId) throw new GatewayError('invalid_provider_response', 502);
        if (current.status !== expectedStatus || !ACTION_STATUS[action].includes(current.status))
          throw new GatewayError('wrong_trade_state', 409);
      }
      if (signal.aborted) throw new GatewayError('unavailable', 503, true);
      attempted = true;
      if (message !== undefined) data = await provider.sendMessage(tradeId, message, signal);
      else if (action === 'mark_paid') data = await provider.markPaid(tradeId, signal);
      else if (action === 'cancel_unfunded') data = await provider.cancelUnfunded(tradeId, signal);
      else if (description !== undefined)
        data = await provider.openDispute(tradeId, description, signal);
      else data = await provider.withdrawDispute(tradeId, signal);
      if (
        data === undefined ||
        Buffer.byteLength(JSON.stringify({ data })) > MAX_RESPONSE_BYTES - 64
      )
        throw new GatewayError('invalid_provider_response', 502);
    } catch (error) {
      let failure = upstreamError(error);
      // A malformed/late success or transport failure cannot prove that a write was rejected.
      const uncertain = attempted && failure.status >= 500;
      if (uncertain) failure = unknownOperation();
      try {
        journal.finish(key, scope, uncertain ? 'unknown' : 'rejected', {
          error: failure.body,
          httpStatus: failure.status
        });
      } catch {
        throw unknownOperation();
      }
      throw failure;
    }
    try {
      journal.finish(key, scope, 'succeeded', { data });
    } catch {
      throw unknownOperation();
    }
    send(response, kind === 'messages' ? 201 : 200, { data });
  }

  /** @param {IncomingMessage} request @param {ServerResponse} response @param {() => void} [next] */
  async function handle(request, response, next) {
    const raw = request.url ?? '';
    const path = raw.split('?')[0];
    if (path !== LOCALCOINSWAP_API_BASE && !path.startsWith(LOCALCOINSWAP_API_BASE + '/')) {
      next?.();
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
    activeRequests.add(controller);
    response.once('close', abort);
    try {
      if (closed) throw new GatewayError('unavailable', 503, true);
      checkLocal(request, originUrl);
      if (raw.length > 1024 || raw.includes('#')) throw invalid();
      const url = new URL(raw, originUrl);
      if (url.pathname !== path) throw invalid();
      const route = path.slice(LOCALCOINSWAP_API_BASE.length);
      const params = url.searchParams;
      const method = request.method;
      const signal = controller.signal;
      const signedIn = authenticated(request);
      if (route === '/capabilities') {
        if (method !== 'GET') methodNotAllowed(response, 'GET');
        exactQuery(params, []);
        send(response, 200, {
          data: {
            mode,
            authenticated: signedIn,
            tradeActions: signedIn && canWrite,
            btcExecution: false
          }
        });
      } else if (route === '/offers') {
        if (method !== 'GET') methodNotAllowed(response, 'GET');
        exactQuery(params, ['intent', 'amountCents', 'country', 'limit', 'offset']);
        const intent = params.get('intent');
        const country = params.get('country');
        if (
          (intent !== 'buy' && intent !== 'sell') ||
          (country !== null && !/^[A-Z]{2}$/.test(country))
        )
          throw invalid();
        const amount = queryInt(params, 'amountCents', 5000, 25000);
        const page = await provider.searchOffers(
          { intent, ...(country ? { country } : {}), ...pagination(params) },
          signal
        );
        send(response, 200, {
          data: {
            ...page,
            items: page.items.filter(
              (offer) =>
                offer.active && amount >= offer.minFiatCents && amount <= offer.maxFiatCents
            )
          }
        });
      } else if (route.startsWith('/offers/')) {
        if (method !== 'GET') methodNotAllowed(response, 'GET');
        exactQuery(params, []);
        send(response, 200, { data: await provider.getOffer(identifier(route.slice(8)), signal) });
      } else if (
        route === '/trades' ||
        route === '/transactions' ||
        route.startsWith('/trades/') ||
        route.startsWith('/operations/')
      ) {
        if (!signedIn) throw new GatewayError('unauthorized', 401);
        if (route === '/trades') {
          if (method !== 'GET') methodNotAllowed(response, 'GET');
          exactQuery(params, ['stage', 'limit', 'offset']);
          const stage = params.get('stage') ?? 'live';
          if (stage !== 'live' && stage !== 'past') throw invalid();
          send(response, 200, {
            data: await provider.listTrades({ stage, ...pagination(params) }, signal)
          });
        } else if (route === '/transactions') {
          if (method !== 'GET') methodNotAllowed(response, 'GET');
          exactQuery(params, ['type', 'limit', 'offset']);
          const type = params.get('type');
          if (type !== null && !isLocalCoinSwapTransactionType(type)) throw invalid();
          send(response, 200, {
            data: await provider.listTransactions(
              { type: type ?? undefined, ...pagination(params) },
              signal
            )
          });
        } else if (route.startsWith('/operations/')) {
          if (method !== 'GET') methodNotAllowed(response, 'GET');
          exactQuery(params, []);
          const receipt = journal?.get(identifier(route.slice(12)), scope);
          if (!receipt) throw new GatewayError('not_found', 404);
          send(response, 200, {
            data: {
              status: receipt.status,
              ...(receipt.data !== undefined ? { data: receipt.data } : {}),
              ...(receipt.error !== undefined ? { error: receipt.error } : {})
            }
          });
        } else {
          const [, , rawId, kind, extra] = route.split('/');
          if (
            extra !== undefined ||
            (kind !== undefined && kind !== 'messages' && kind !== 'actions')
          )
            throw new GatewayError('not_found', 404);
          const tradeId = identifier(rawId);
          if (kind === undefined) {
            if (method !== 'GET') methodNotAllowed(response, 'GET');
            exactQuery(params, []);
            const data = await provider.getTrade(tradeId, signal);
            if (data.id !== tradeId) throw new GatewayError('invalid_provider_response', 502);
            send(response, 200, { data });
          } else if (kind === 'messages' && method === 'GET') {
            exactQuery(params, ['limit', 'offset', 'view']);
            const view = params.get('view');
            if (view !== null && (view !== 'latest' || params.has('offset'))) throw invalid();
            const page = pagination(params);
            const data =
              view === 'latest'
                ? await provider.listLatestMessages(tradeId, { limit: page.limit }, signal)
                : await provider.listMessages(tradeId, page, signal);
            send(response, 200, { data });
          } else {
            if (method !== 'POST')
              methodNotAllowed(response, kind === 'messages' ? 'GET, POST' : 'POST');
            exactQuery(params, []);
            await write(request, response, tradeId, kind, signal);
          }
        }
      } else throw new GatewayError('not_found', 404);
    } catch (error) {
      const failure = upstreamError(error);
      if (
        failure.body.retryAfterSeconds !== undefined &&
        !response.destroyed &&
        !response.writableEnded
      )
        response.setHeader('Retry-After', String(failure.body.retryAfterSeconds));
      send(response, failure.status, { error: failure.body });
    } finally {
      clearTimeout(timer);
      response.removeListener('close', abort);
      activeRequests.delete(controller);
      closeJournalIfIdle();
    }
  }

  return Object.assign(handle, {
    close() {
      if (closed) return;
      closed = true;
      for (const controller of activeRequests) controller.abort();
      closeJournalIfIdle();
    }
  });
}
