// @ts-check

const origin = 'https://api.localcoinswap.com';
const timeoutMs = 8_000;
const responseLimit = 1_048_576;
const maxOffset = 10_000;
const maxBitcoinSats = 2_100_000_000_000_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const countryPattern = /^[A-Z]{2}$/;
const forbiddenText =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

const statuses = new Set([
  'CREATED',
  'ACCEPTED',
  'REJECTED',
  'WAITING_FOR_ESCROW',
  'BROADCASTING_ESCROW',
  'BROADCASTING_ESCROW_FAILED',
  'WAITING_FOR_MIN_ESCROW_CONFIRMS',
  'CRYPTO_ESC',
  'CRYPTO_ESC_FAILED',
  'FUND_PAID',
  'FUND_RECEIVED',
  'COMPLETED',
  'EXPIRED',
  'DISPUTED',
  'WAITING_FOR_DISPUTE_CONFIRMS',
  'DISPUTE_RESOLVE_BUYER',
  'DISPUTE_RESOLVE_SELLER',
  'CANCELLATION_REQUESTED',
  'CANCELLED',
  'CANCELLED_AFTER_ESCROW',
  'CANCELLATION_REJECTED',
  'BROADCASTING_RELEASE',
  'BROADCASTING_RELEASE_FAILED',
  'WAITING_FOR_CRYPTO_RELEASE_CONFIRMS',
  'CRYPTO_REL',
  'CRYPTO_REL_FAILED',
  'WAITING_FOR_MIN_APPROVE_CONFIRMS',
  'TRANSFER_APPROVED',
  'WAITING_FOR_TRANSFER_APPROVE'
]);

/** @typedef {'DEPOSIT'|'WITHDRAW'|'ESCROW'|'ESCROW_RELEASE'|'ESCROW_REFUND'|'ESCROW_FEE'} TransactionType */
/** @type {ReadonlySet<string>} */
const transactionTypes = new Set([
  'DEPOSIT',
  'WITHDRAW',
  'ESCROW',
  'ESCROW_RELEASE',
  'ESCROW_REFUND',
  'ESCROW_FEE'
]);

const httpStatus = {
  invalid_request: 400,
  provider_auth: 401,
  provider_forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  invalid_response: 502,
  provider_unavailable: 503,
  operation_unknown: 502
};

/** @typedef {keyof typeof httpStatus} ErrorCode */
/** @typedef {'buy' | 'sell'} Intent */
/** @typedef {{limit?: number, offset?: number}} PageOptions */
/** @typedef {{intent: Intent, country?: string} & PageOptions} OfferOptions */
/** @typedef {{stage?: 'live'|'past'} & PageOptions} TradeOptions */
/** @typedef {{type?: string} & PageOptions} TransactionOptions */
/** @typedef {{limit:number, offset:number}} PageBounds */
/** @typedef {Record<string, unknown>} ProviderObject */

/** Errors expose bounded codes and timing hints, without raw provider data. */
export class LocalCoinSwapError extends Error {
  /** @param {ErrorCode} code @param {number} [retryAfterSeconds] */
  constructor(code, retryAfterSeconds) {
    super(code);
    this.name = 'LocalCoinSwapError';
    this.code = code;
    this.status = httpStatus[code];
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** @param {unknown} value @returns {ProviderObject} */
function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new LocalCoinSwapError('invalid_response');
  return /** @type {ProviderObject} */ (value);
}

/** @param {unknown} value @param {number} min @param {number} max @returns {value is number} */
function integer(value, min, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** @param {unknown} value @param {ErrorCode} [code] */
function uuid(value, code = 'invalid_request') {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new LocalCoinSwapError(code);
  return value;
}

/** @param {unknown} value @param {number} max @param {ErrorCode} [code] */
function text(value, max, code = 'invalid_response') {
  if (typeof value !== 'string' || !value.trim() || value.length > max || forbiddenText.test(value))
    throw new LocalCoinSwapError(code);
  return value.replace(/\r\n?/g, '\n');
}

/** @param {unknown} value */
function username(value) {
  if (typeof value !== 'string' || !/^[\w.@+-]{1,150}$/.test(value))
    throw new LocalCoinSwapError('invalid_response');
  return value;
}

/** Parse provider decimal strings exactly, including padded trailing zeros. @param {unknown} value */
function decimal(value) {
  const match =
    typeof value === 'string' ? /^(0|[1-9]\d{0,29})(?:\.(\d{1,18}))?$/.exec(value) : null;
  if (!match) throw new LocalCoinSwapError('invalid_response');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return { units: BigInt(match[1] + fraction), scale: fraction.length };
}

/** @param {unknown} value @param {number} precision */
function exactUnits(value, precision) {
  const { units, scale } = decimal(value);
  if (scale > precision) throw new LocalCoinSwapError('invalid_response');
  return positiveInteger(units * 10n ** BigInt(precision - scale));
}

/** @param {bigint} value */
function positiveInteger(value) {
  if (value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new LocalCoinSwapError('invalid_response');
  return Number(value);
}

/** @param {unknown} value */
function country(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !countryPattern.test(value))
    throw new LocalCoinSwapError('invalid_response');
  return value;
}

/** @param {unknown} value */
function normalizeOffer(value) {
  const row = object(value);
  const side = object(row.trading_type).slug;
  const coin = object(row.coin_currency);
  const fiat = object(row.fiat_currency);
  if (
    (side !== 'buy' && side !== 'sell') ||
    coin.symbol !== 'BTC' ||
    (coin.slug !== undefined && coin.slug !== 'BTC') ||
    coin.token_standard != null ||
    fiat.symbol !== 'EUR' ||
    fiat.token_standard != null ||
    object(row.payment_method).slug !== 'sepa-instant' ||
    (row.is_active !== undefined && typeof row.is_active !== 'boolean') ||
    (row.hidden !== undefined && typeof row.hidden !== 'boolean') ||
    (row.enforced_sizes != null && typeof row.enforced_sizes !== 'string')
  )
    throw new LocalCoinSwapError('invalid_response');

  const { units, scale } = decimal(row.price_formula_value);
  const divisor = 10n ** BigInt(scale);
  const minFiatCents = exactUnits(row.min_trade_size, 2);
  const maxFiatCents = exactUnits(row.max_trade_size, 2);
  if (maxFiatCents < minFiatCents) throw new LocalCoinSwapError('invalid_response');

  return {
    id: uuid(row.uuid, 'invalid_response'),
    intent: /** @type {Intent} */ (side === 'sell' ? 'buy' : 'sell'),
    country: country(row.country_code),
    currency: /** @type {const} */ ('EUR'),
    paymentMethod: /** @type {const} */ ('sepa_instant'),
    pricePerBtcCents: positiveInteger((units * 100n + divisor / 2n) / divisor),
    exactPricePerBtc: { units: units.toString(), scale },
    minFiatCents,
    maxFiatCents,
    maker: username(object(row.created_by).username),
    terms:
      row.trading_conditions == null || row.trading_conditions === ''
        ? null
        : text(row.trading_conditions, 16_000),
    active: row.is_active !== false && row.hidden !== true && !row.enforced_sizes
  };
}

/** @param {unknown} value */
function timestamp(value) {
  if (value == null) return null;
  if (!integer(value, 0, 2_147_483_647)) throw new LocalCoinSwapError('invalid_response');
  return value * 1_000;
}

/** @param {unknown} value */
function tradeStatus(value) {
  if (typeof value !== 'string' || !statuses.has(value))
    throw new LocalCoinSwapError('invalid_response');
  return value;
}

/** @param {unknown} value @param {string} [expectedId] */
function normalizeTrade(value, expectedId) {
  const row = object(value);
  const id = uuid(row.uuid, 'invalid_response');
  const buyer = username(object(row.buyer).username);
  const seller = username(object(row.seller).username);
  if (
    (expectedId !== undefined && id !== expectedId) ||
    buyer === seller ||
    object(row.coin_currency).symbol !== 'BTC' ||
    object(row.fiat_currency).symbol !== 'EUR' ||
    object(object(row.ad ?? row.offer).payment_method).slug !== 'sepa-instant' ||
    row.non_custodial === false
  )
    throw new LocalCoinSwapError('invalid_response');
  return {
    id,
    status: tradeStatus(row.status),
    buyer,
    seller,
    fiatCents: exactUnits(row.fiat_amount, 2),
    bitcoinSats: exactUnits(row.coin_amount, 8),
    createdAtMs: timestamp(row.time_created),
    expiresAtMs: timestamp(row.time_of_expiry)
  };
}

/** @param {unknown} value @returns {value is TransactionType} */
export function isLocalCoinSwapTransactionType(value) {
  return typeof value === 'string' && transactionTypes.has(value);
}

/** @param {unknown} value @param {TransactionType} [expectedType] */
function normalizeTransaction(value, expectedType) {
  const row = object(value);
  const { tx, txtype, is_confirmed: confirmed, value: sats } = row;
  if (
    !integer(row.id, 1) ||
    !isLocalCoinSwapTransactionType(txtype) ||
    (expectedType !== undefined && txtype !== expectedType) ||
    (tx != null && (typeof tx !== 'string' || !/^[0-9a-fA-F]{64}$/.test(tx))) ||
    (sats != null && !integer(sats, -maxBitcoinSats, maxBitcoinSats)) ||
    (confirmed != null && typeof confirmed !== 'boolean')
  )
    throw new LocalCoinSwapError('invalid_response');
  return {
    id: row.id,
    txid: tx?.toLowerCase() ?? null,
    type: txtype,
    sats: sats ?? null,
    confirmed: confirmed ?? null,
    firstSeenAtMs: timestamp(row.first_seen_at),
    confirmedAtMs: timestamp(row.confirmed_at)
  };
}

/** @param {unknown} value */
function normalizeMessage(value) {
  const row = object(value);
  if (!integer(row.id, 1)) throw new LocalCoinSwapError('invalid_response');
  const attachment = row.attachment;
  const hasAttachment = Boolean(
    row.file || (typeof attachment === 'string' ? attachment : attachment && object(attachment).url)
  );
  const body = row.content ?? row.message;
  const content = body == null || body === '' ? null : text(body, 1_000);
  if (!content && !hasAttachment) throw new LocalCoinSwapError('invalid_response');
  return {
    id: row.id,
    sender: username(object(row.created_by).username),
    content,
    createdAtMs: timestamp(row.time_created),
    hasAttachment
  };
}

/** @param {PageOptions} options @returns {PageBounds} */
function pageBounds({ limit = 20, offset = 0 }) {
  if (!integer(limit, 1, 100) || !integer(offset, 0, maxOffset))
    throw new LocalCoinSwapError('invalid_request');
  return { limit, offset };
}

/** @param {unknown} value @param {PageBounds} bounds */
function readPage(value, { limit, offset }) {
  const row = object(value);
  if (
    !Array.isArray(row.results) ||
    row.results.length > limit ||
    !integer(row.count, row.results.length) ||
    (row.offset !== undefined && row.offset !== offset) ||
    (row.limit !== undefined && !integer(row.limit, 1, 100))
  )
    throw new LocalCoinSwapError('invalid_response');
  const next = offset + row.results.length;
  return {
    results: /** @type {unknown[]} */ (row.results),
    nextOffset: row.results.length && next < row.count && next <= maxOffset ? next : null,
    total: row.count
  };
}

/** @template {{id:string|number}} T @param {T[]} items */
function unique(items) {
  const counts = new Map();
  for (const { id } of items) counts.set(id, (counts.get(id) ?? 0) + 1);
  return items.filter(({ id }) => counts.get(id) === 1);
}

/** @param {Response} response */
function cancelBody(response) {
  if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
}

/** @template T @param {Promise<T>} pending @param {AbortSignal} signal @returns {Promise<T>} */
function abortable(pending, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new LocalCoinSwapError('provider_unavailable'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
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

/** @param {Response} response @param {AbortSignal} signal @returns {Promise<unknown>} */
async function readJson(response, signal) {
  const type = response.headers.get('content-type');
  const length = response.headers.get('content-length');
  if (
    !type ||
    !/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-?8"?)?\s*$/i.test(type) ||
    (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > responseLimit)) ||
    !response.body
  ) {
    cancelBody(response);
    throw new LocalCoinSwapError('invalid_response');
  }
  const reader = response.body.getReader();
  let complete = false;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let body = '';
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > responseLimit) throw new LocalCoinSwapError('invalid_response');
      body += decoder.decode(chunk.value, { stream: true });
    }
    const value = JSON.parse(body + decoder.decode());
    complete = true;
    return value;
  } catch (error) {
    if (error instanceof LocalCoinSwapError) throw error;
    throw new LocalCoinSwapError('invalid_response');
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** @param {string|null} value @param {number} time */
function retryAfter(value, time) {
  if (value && /^\d{1,10}$/.test(value)) return Math.min(86_400, Math.max(1, Number(value)));
  if (value && /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
    const date = Date.parse(value);
    if (Number.isFinite(date))
      return Math.min(86_400, Math.max(1, Math.ceil((date - time) / 1_000)));
  }
  return 60;
}

/** @param {number} status @param {boolean} mutation @returns {ErrorCode} */
function upstreamError(status, mutation) {
  switch (status) {
    case 400:
    case 422:
      return 'invalid_request';
    case 401:
      return 'provider_auth';
    case 403:
      return 'provider_forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    default:
      return mutation ? 'operation_unknown' : 'provider_unavailable';
  }
}

/**
 * One instance owns a server-side provider key and its backoff. No endpoint, origin or
 * scope is caller-selected. Writes are never automatically retried.
 * @param {{apiKey?:string, fetcher?:typeof fetch, now?:()=>number}} [options]
 */
export function createLocalCoinSwapProvider({ apiKey, fetcher = fetch, now = Date.now } = {}) {
  const backoffUntil = { public: 0, account: 0 };

  /**
   * @template T
   * @param {string} path
   * @param {(body:unknown)=>T} normalize
   * @param {{signal?:AbortSignal, authenticated?:boolean, method?:'GET'|'POST'|'PATCH', payload?:ProviderObject, status?:number}} [options]
   */
  async function request(
    path,
    normalize,
    { signal, authenticated = true, method = 'GET', payload, status = 200 } = {}
  ) {
    if (authenticated && (typeof apiKey !== 'string' || !/^lcs_[A-Za-z0-9_-]{3,252}$/.test(apiKey)))
      throw new LocalCoinSwapError('provider_auth');
    if (signal?.aborted) throw new LocalCoinSwapError('provider_unavailable');

    const bucket = authenticated ? 'account' : 'public';
    const remaining = backoffUntil[bucket] - now();
    if (remaining > 0) throw new LocalCoinSwapError('rate_limited', Math.ceil(remaining / 1_000));

    const controller = new AbortController();
    const active = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const mutation = method !== 'GET';
    try {
      const headers = new Headers({ Accept: 'application/json' });
      if (authenticated) headers.set('Authorization', `ApiKey ${apiKey}`);
      if (payload !== undefined) headers.set('Content-Type', 'application/json');
      const pending = fetcher(new URL(path, origin), {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        redirect: 'error',
        cache: 'no-store',
        signal: active
      }).then((response) => {
        if (active.aborted) cancelBody(response);
        return response;
      });
      const response = await abortable(pending, active);
      if (response.redirected || response.status !== status) {
        cancelBody(response);
        if (response.status === 429) {
          const time = now();
          const seconds = retryAfter(response.headers.get('retry-after'), time);
          backoffUntil[bucket] = Math.max(backoffUntil[bucket], time + seconds * 1_000);
          throw new LocalCoinSwapError('rate_limited', seconds);
        }
        throw new LocalCoinSwapError(upstreamError(response.status, mutation));
      }
      const body = object(await readJson(response, active));
      if (body.error === true) throw new LocalCoinSwapError('invalid_response');
      return normalize(body);
    } catch (error) {
      if (error instanceof LocalCoinSwapError) {
        if (
          mutation &&
          (error.code === 'provider_unavailable' || error.code === 'invalid_response')
        )
          throw new LocalCoinSwapError('operation_unknown');
        throw error;
      }
      throw new LocalCoinSwapError(mutation ? 'operation_unknown' : 'provider_unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  /** @param {OfferOptions} options @param {AbortSignal} [signal] */
  function searchOffers({ intent, country: market, limit, offset }, signal) {
    if (
      (intent !== 'buy' && intent !== 'sell') ||
      (market !== undefined && (typeof market !== 'string' || !countryPattern.test(market)))
    )
      throw new LocalCoinSwapError('invalid_request');
    const bounds = pageBounds({ limit, offset });
    const query = new URLSearchParams({
      coin_currency: 'BTC',
      fiat_currency: 'EUR',
      trading_type: intent === 'buy' ? 'sell' : 'buy',
      payment_method: 'sepa-instant',
      last_seen: '30mins',
      limit: String(bounds.limit),
      offset: String(bounds.offset)
    });
    if (market) query.set('country_code_exact', market);
    return request(
      `/api/v2/offers/search/?${query}`,
      (body) => {
        const { results, nextOffset, total } = readPage(body, bounds);
        const observedAtMs = now();
        const offers = results.flatMap((row) => {
          try {
            const offer = normalizeOffer(row);
            return offer.active && offer.intent === intent && (!market || offer.country === market)
              ? [{ ...offer, observedAtMs }]
              : [];
          } catch (error) {
            if (error instanceof LocalCoinSwapError && error.code === 'invalid_response') return [];
            throw error;
          }
        });
        return { items: unique(offers), nextOffset, total };
      },
      { signal, authenticated: false }
    );
  }

  /** @param {string} id @param {AbortSignal} [signal] */
  function getOffer(id, signal) {
    const expected = uuid(id);
    return request(
      `/api/v2/offers/${expected}/`,
      (body) => {
        if (typeof object(body).is_active !== 'boolean')
          throw new LocalCoinSwapError('invalid_response');
        const offer = normalizeOffer(body);
        if (offer.id !== expected) throw new LocalCoinSwapError('invalid_response');
        return { ...offer, observedAtMs: now() };
      },
      { signal, authenticated: false }
    );
  }

  /** @param {TradeOptions} [options] @param {AbortSignal} [signal] */
  function listTrades({ stage = 'live', limit, offset } = {}, signal) {
    if (stage !== 'live' && stage !== 'past') throw new LocalCoinSwapError('invalid_request');
    const bounds = pageBounds({ limit, offset });
    const query = new URLSearchParams({
      stage,
      trade_format: 'non-custodial',
      coin_currency: 'BTC',
      fiat_currency: 'EUR',
      payment_method: 'sepa-instant',
      limit: String(bounds.limit),
      offset: String(bounds.offset)
    });
    return request(
      `/api/v2/trades/list/?${query}`,
      (body) => {
        const { results, nextOffset, total } = readPage(body, bounds);
        return { items: unique(results.map((row) => normalizeTrade(row))), nextOffset, total };
      },
      { signal }
    );
  }

  /** @param {string} id @param {AbortSignal} [signal] */
  function getTrade(id, signal) {
    const expected = uuid(id);
    return request(`/api/v2/trades/${expected}/`, (body) => normalizeTrade(body, expected), {
      signal
    });
  }

  /** @param {TransactionOptions} [options] @param {AbortSignal} [signal] */
  function listTransactions({ type, limit, offset } = {}, signal) {
    if (type !== undefined && !isLocalCoinSwapTransactionType(type))
      throw new LocalCoinSwapError('invalid_request');
    const bounds = pageBounds({ limit, offset });
    const query = new URLSearchParams({
      limit: String(bounds.limit),
      offset: String(bounds.offset)
    });
    if (type !== undefined) query.set('txtype', type);
    return request(
      `/api/v2/tx-history/non-custodial/BTC/?${query}`,
      (body) => {
        const { results, nextOffset, total } = readPage(body, bounds);
        const items = results.map((row) => normalizeTransaction(row, type));
        if (
          (items.length > 0 && bounds.offset + items.length > total) ||
          new Set(items.map(({ id }) => id)).size !== items.length
        )
          throw new LocalCoinSwapError('invalid_response');
        return { items, nextOffset, total };
      },
      { signal }
    );
  }

  /** @param {string} id @param {PageBounds} bounds @param {AbortSignal} [signal] */
  function readMessagesPage(id, bounds, signal) {
    const expected = uuid(id);
    const query = new URLSearchParams({
      limit: String(bounds.limit),
      offset: String(bounds.offset)
    });
    return request(
      `/api/v2/trades/message/list/${expected}/?${query}`,
      (body) => readPage(body, bounds),
      { signal }
    );
  }

  /** @param {string} id @param {PageOptions} [options] @param {AbortSignal} [signal] */
  function listMessages(id, options = {}, signal) {
    return readMessagesPage(id, pageBounds(options), signal).then(
      ({ results, nextOffset, total }) => ({
        items: unique(results.map(normalizeMessage)),
        nextOffset,
        total
      })
    );
  }

  /** @param {string} id @param {{limit?:number}} [options] @param {AbortSignal} [signal] */
  async function listLatestMessages(id, options = {}, signal) {
    const { limit } = pageBounds(options);
    const first = await readMessagesPage(id, { limit, offset: 0 }, signal);
    const offset = Math.max(0, first.total - limit);
    if (offset > maxOffset) throw new LocalCoinSwapError('invalid_response');
    // The upstream chat is oldest first. Leave bounded space for appends between reads.
    const window = offset
      ? await readMessagesPage(id, { limit: Math.min(100, limit + 16), offset }, signal)
      : first;
    if (
      offset + window.results.length !== window.total ||
      (offset > 0 && window.results.length < limit)
    )
      throw new LocalCoinSwapError('provider_unavailable');
    const rows = window.results.slice(-limit);
    const items = unique(rows.map(normalizeMessage));
    const start = window.total - rows.length;
    if (items.length !== rows.length || start > maxOffset)
      throw new LocalCoinSwapError('invalid_response');
    return { items, nextOffset: null, total: window.total, offset: start };
  }

  /** @param {string} id @param {string} content @param {AbortSignal} [signal] */
  function sendMessage(id, content, signal) {
    return request(`/api/v2/trades/message/${uuid(id)}/`, normalizeMessage, {
      signal,
      method: 'POST',
      payload: { content: text(content, 1_000, 'invalid_request') },
      status: 201
    });
  }

  /**
   * @param {string} id @param {'FUND_PAID'|'CANCELLED'} status
   * @param {AbortSignal} [signal]
   */
  function updateTrade(id, status, signal) {
    const expected = uuid(id);
    return request(
      `/api/v2/trades/non-custodial/update/${expected}/`,
      (body) => {
        const trade = normalizeTrade(body, expected);
        if (
          trade.status !== status &&
          (status !== 'CANCELLED' || trade.status !== 'CANCELLATION_REQUESTED')
        )
          throw new LocalCoinSwapError('invalid_response');
        return trade;
      },
      { signal, method: 'PATCH', payload: { status } }
    );
  }

  /** @param {string} id @param {AbortSignal} [signal] */
  function markPaid(id, signal) {
    return updateTrade(id, 'FUND_PAID', signal);
  }

  /** @param {string} id @param {AbortSignal} [signal] */
  function cancelUnfunded(id, signal) {
    return updateTrade(id, 'CANCELLED', signal);
  }

  /** @param {string} id @param {string} description @param {AbortSignal} [signal] */
  function openDispute(id, description, signal) {
    const expected = uuid(id);
    return request(
      `/api/v2/trades/dispute/${expected}/`,
      (body) => {
        text(object(body).message, 2_000);
        return { id: expected, status: 'DISPUTED' };
      },
      {
        signal,
        method: 'POST',
        payload: { description: text(description, 4_000, 'invalid_request') }
      }
    );
  }

  /** @param {string} id @param {AbortSignal} [signal] */
  function withdrawDispute(id, signal) {
    const expected = uuid(id);
    return request(
      `/api/v2/trades/withdraw-dispute/${expected}/`,
      (body) => {
        const row = object(body);
        if (uuid(row.uuid, 'invalid_response') !== expected)
          throw new LocalCoinSwapError('invalid_response');
        const status = tradeStatus(row.status);
        if (status === 'DISPUTED') throw new LocalCoinSwapError('invalid_response');
        return { id: expected, status };
      },
      { signal, method: 'POST' }
    );
  }

  return {
    searchOffers,
    getOffer,
    listTrades,
    getTrade,
    listTransactions,
    listMessages,
    listLatestMessages,
    sendMessage,
    markPaid,
    cancelUnfunded,
    openDispute,
    withdrawDispute
  };
}
