import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackendError,
  backendRequest,
  decodeEvents,
  decodeMessages,
  decodeOffers,
  decodeQuote,
  decodeSession,
  decodeTrade,
  decodeTrades,
  mutation,
  TRADE_STATES
} from './backend-client';

const ids = {
  account: '10000000-0000-4000-8000-000000000001',
  other: '10000000-0000-4000-8000-000000000002',
  offer: '20000000-0000-4000-8000-000000000001',
  quote: '30000000-0000-4000-8000-000000000001',
  trade: '40000000-0000-4000-8000-000000000001',
  message: '50000000-0000-4000-8000-000000000001',
  event: '60000000-0000-4000-8000-000000000001'
};
const now = 1_799_999_000_000;
const session = {
  account: { id: ids.account, username: 'market_tester', createdAt: now },
  csrfToken: 'c'.repeat(43),
  expiresAt: now + 43_200_000
};
const offer = {
  id: ids.offer,
  revision: 1,
  intent: 'buy',
  alias: 'River · simulated',
  ownerId: ids.other,
  pricePerBtcCents: 9_000_000,
  minCents: 5000,
  maxCents: 25000,
  synthetic: true
};
const quote = {
  id: ids.quote,
  intent: 'buy',
  offerId: ids.offer,
  alias: 'River · simulated',
  fiatCents: 15000,
  grossSats: 166666,
  platformFeeSats: 1667,
  fundingFeeSats: 500,
  releaseFeeSats: 500,
  bitcoinSats: 164499,
  createdAt: now,
  expiresAt: now + 60000,
  mode: 'sandbox'
};
const trade = {
  id: ids.trade,
  mode: 'sandbox',
  buyerId: ids.account,
  sellerId: ids.other,
  role: 'buyer',
  state: 'escrow_pending',
  revision: 0,
  quote,
  createdAt: now,
  updatedAt: now
};
const message = {
  id: ids.message,
  tradeId: ids.trade,
  actorId: ids.account,
  text: 'Only a test message.',
  createdAt: now
};
const event = {
  id: ids.event,
  actorId: 'sandbox_simulator',
  kind: 'sandbox_confirm_escrow',
  revision: 1,
  createdAt: now
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function invalid(decode: (value: unknown) => unknown, value: unknown) {
  expect(() => decode(value)).toThrow(
    expect.objectContaining({ code: 'invalid_response', ambiguous: true })
  );
}
function envelope(data: unknown) {
  return { apiVersion: 1, mode: 'sandbox', data };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function fakeStreamResponse(reader: {
  read: () => Promise<unknown>;
  cancel: () => Promise<unknown>;
}): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: { getReader: () => reader, cancel: reader.cancel }
  } as unknown as Response;
}

describe('strict marketplace response contracts', () => {
  it('accepts actual server-shaped session, offer, quote, trade, message and event DTOs', () => {
    expect(decodeSession({ account: null })).toEqual({ account: null });
    expect(decodeSession(session)).toEqual(session);
    expect(decodeOffers([offer])).toEqual([offer]);
    expect(decodeQuote(quote)).toEqual(quote);
    expect(decodeTrade(trade)).toEqual(trade);
    expect(decodeTrades([trade])).toEqual([trade]);
    expect(decodeMessages([message])).toEqual([message]);
    expect(decodeEvents([event])).toEqual([event]);
  });
  it.each(TRADE_STATES)(
    'accepts persisted %s state without deriving a different state in the UI',
    (state) => {
      expect(decodeTrade({ ...trade, state }).state).toBe(state);
    }
  );
  it('accepts sell debit with ceil platform fee and fixed funding fee', () => {
    const sell = { ...quote, intent: 'sell', grossSats: 166667, bitcoinSats: 168834 };
    expect(decodeQuote(sell)).toEqual(sell);
  });
  it.each([
    null,
    undefined,
    [],
    'session',
    {},
    { account: {} },
    { ...session, csrfToken: '' },
    { ...session, csrfToken: 'invalid csrf token' },
    { ...session, csrfToken: 'a'.repeat(44) },
    { ...session, account: { ...session.account, id: 'unvalidated-account' } },
    { ...session, account: { ...session.account, username: 'UPPER_CASE' } },
    { ...session, account: { ...session.account, username: '<script>' } },
    { ...session, expiresAt: -1 },
    { ...session, expiresAt: Number.MAX_SAFE_INTEGER + 1 },
    { ...session, expiresAt: 0 }
  ])('rejects invalid authenticated session %j', (value) => invalid(decodeSession, value));
  it.each([
    ['id', 'not-uuid'],
    ['offerId', '../wallet'],
    ['alias', 'a\nforged label'],
    ['mode', 'live'],
    ['intent', 'BUY'],
    ['fiatCents', 4999],
    ['fiatCents', 25001],
    ['fiatCents', 15000.5],
    ['grossSats', 0],
    ['grossSats', -1],
    ['grossSats', Number.MAX_SAFE_INTEGER + 1],
    ['platformFeeSats', 0],
    ['platformFeeSats', 1666],
    ['fundingFeeSats', 0],
    ['releaseFeeSats', 501],
    ['bitcoinSats', 164500],
    ['bitcoinSats', '164499'],
    ['createdAt', -1],
    ['expiresAt', now + 60001]
  ])('rejects incoherent quote field %s=%j', (field, value) =>
    invalid(decodeQuote, { ...quote, [field]: value })
  );
  it.each([
    ['id', 'not-uuid'],
    ['ownerId', 'someone'],
    ['revision', 0],
    ['synthetic', false],
    ['intent', 'buy-now'],
    ['alias', 'x'.repeat(161)],
    ['pricePerBtcCents', 0],
    ['pricePerBtcCents', 1_000_000_001],
    ['minCents', 4999],
    ['maxCents', 25001],
    ['minCents', 25001]
  ])('rejects malformed offer field %s=%j', (field, value) =>
    invalid(decodeOffers, [{ ...offer, [field]: value }])
  );
  it.each([
    ['id', 'invalid'],
    ['buyerId', '../buyer'],
    ['sellerId', 'seller'],
    ['sellerId', ids.account],
    ['mode', 'live'],
    ['role', 'arbitrator'],
    ['state', 'automatically_released'],
    ['revision', 0.5],
    ['updatedAt', now - 1],
    ['quote', { ...quote, mode: 'live' }]
  ])('rejects malformed trade field %s=%j', (field, value) =>
    invalid(decodeTrade, { ...trade, [field]: value })
  );
  it('bounds every collection before iterating and rejects malformed members', () => {
    for (const [decode, item] of [
      [decodeOffers, offer],
      [decodeTrades, trade],
      [decodeMessages, message],
      [decodeEvents, event]
    ] as const) {
      invalid(
        decode,
        Array.from({ length: 101 }, () => item)
      );
      invalid(decode, [null]);
      invalid(decode, {});
      expect(decode([])).toEqual([]);
    }
    invalid(decodeMessages, [{ ...message, text: '' }]);
    invalid(decodeMessages, [{ ...message, text: 'x'.repeat(2001) }]);
    invalid(decodeEvents, [{ ...event, revision: -1 }]);
    invalid(decodeEvents, [{ ...event, kind: 'x'.repeat(81) }]);
  });
});

describe('same-origin bounded request transport', () => {
  it('sends only the approved browser request settings and preserves the retry key', async () => {
    const fetch = vi.fn().mockResolvedValue(json(envelope(quote)));
    vi.stubGlobal('fetch', fetch);
    const operation = mutation('/v1/quotes', { offerId: ids.offer, amountCents: 15000 });
    expect(operation.key).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      await backendRequest(operation.path, decodeQuote, {
        method: 'POST',
        body: operation.body,
        csrf: session.csrfToken,
        key: operation.key
      })
    ).toEqual(quote);
    expect(fetch).toHaveBeenCalledWith(
      '/v1/quotes',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          'Content-Type': 'application/json',
          'X-Groot-Marketplace-CSRF': session.csrfToken,
          'Idempotency-Key': operation.key
        },
        body: JSON.stringify(operation.body)
      })
    );
  });
  it.each([
    'https://evil.example/v1/trades',
    '//evil.example/v1/trades',
    '/v1/../wallet',
    '/v1/%2e%2e/wallet',
    '/v1/trades#fragment',
    '/v1/trades?account=other',
    '/v1\\trades',
    '/v1/nonexistent',
    '/v1/offers?intent=buy&amountCents=15000&intent=sell',
    '/v1/offers?intent=buy&amountCents=NaN'
  ])('rejects unsafe or unknown path %s before fetch', async (path) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(backendRequest(path, (value) => value)).rejects.toMatchObject({
      code: 'invalid_request'
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [{ apiVersion: 2, mode: 'sandbox', data: session }, 'invalid_response'],
    [{ apiVersion: 1, mode: 'live', data: session }, 'invalid_response'],
    [{ apiVersion: 1, data: session }, 'invalid_response'],
    [[], 'invalid_response'],
    [null, 'invalid_response']
  ])('rejects incompatible or malformed envelopes %j', async (value, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(value)));
    await expect(backendRequest('/v1/session', decodeSession)).rejects.toMatchObject({
      code,
      ambiguous: true
    });
  });
  it.each([
    'invalid_request',
    'unauthenticated',
    'forbidden',
    'not_found',
    'conflict',
    'quote_expired',
    'invalid_transition',
    'rate_limited'
  ])('returns stable %s failures without pretending they committed', async (code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ apiVersion: 1, mode: 'sandbox', error: { code } }, 400))
    );
    await expect(backendRequest('/v1/session', decodeSession)).rejects.toMatchObject({
      code,
      ambiguous: false
    });
  });
  it('marks network and server errors ambiguous while sanitizing unknown provider text', async () => {
    for (const [response, code] of [
      [
        json({ apiVersion: 1, mode: 'sandbox', error: { code: 'private database password' } }, 503),
        'unavailable'
      ],
      [new Response('private failure', { status: 502 }), 'invalid_response'],
      [
        new Response(new Uint8Array([0xff]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }),
        'unavailable'
      ]
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(backendRequest('/v1/session', decodeSession)).rejects.toMatchObject({
        code,
        ambiguous: true
      });
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private transport detail')));
    await expect(backendRequest('/v1/session', decodeSession)).rejects.toMatchObject({
      code: 'unavailable',
      ambiguous: true
    });
  });
  it('rejects and cancels an oversized streamed body', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const read = vi.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array(1048577) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeStreamResponse({ read, cancel })));
    await expect(backendRequest('/v1/session', decodeSession)).rejects.toMatchObject({
      code: 'invalid_response',
      ambiguous: true
    });
    expect(cancel).toHaveBeenCalled();
  });
  it('loads a complete valid history of 100 maximum-length multibyte messages without truncation', async () => {
    const messages = Array.from({ length: 100 }, (_, index) => ({
      ...message,
      id: `50000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
      text: '漢'.repeat(2000),
      createdAt: now + index
    }));
    const encoded = new TextEncoder().encode(JSON.stringify(envelope(messages)));
    expect(encoded.byteLength).toBe(618042);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < encoded.byteLength; offset += 65536) {
          controller.enqueue(encoded.subarray(offset, offset + 65536));
        }
        controller.close();
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(encoded.byteLength)
          }
        })
      )
    );
    const result = await backendRequest(`/v1/trades/${ids.trade}/messages`, decodeMessages);
    expect(result).toEqual(messages);
    expect(new Set(result.map((item) => item.id)).size).toBe(100);
  });
  it('accepts a valid JSON response at exactly the one MiB byte boundary', async () => {
    const data = JSON.stringify(envelope({ account: null }));
    const body = data + ' '.repeat(1048576 - new TextEncoder().encode(data).byteLength);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: { 'Content-Type': 'application/json', 'Content-Length': '1048576' }
        })
      )
    );
    expect(await backendRequest('/v1/session', decodeSession)).toEqual({ account: null });
  });
  it.each(['1048577', '-1', '1e6', '1, 1'])(
    'rejects declared response length %s before reading the body',
    async (length) => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      const read = vi.fn();
      const response = fakeStreamResponse({ read, cancel });
      response.headers.set('Content-Length', length);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(backendRequest('/v1/session', decodeSession)).rejects.toMatchObject({
        code: 'invalid_response',
        ambiguous: true
      });
      expect(cancel).toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    }
  );
  it('does not fetch when already aborted', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(
      backendRequest('/v1/session', decodeSession, { signal: controller.signal })
    ).rejects.toMatchObject({ ambiguous: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds a fetch that ignores abort and cancels its late response body', async () => {
    vi.useFakeTimers();
    const fetched = deferred<Response>();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const read = vi.fn().mockResolvedValue({ done: true });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetched.promise));
    const result = backendRequest('/v1/session', decodeSession);
    const rejected = expect(result).rejects.toMatchObject({ code: 'unavailable', ambiguous: true });
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    fetched.resolve(fakeStreamResponse({ read, cancel }));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds and cancels a response stream that stalls after headers', async () => {
    vi.useFakeTimers();
    const stalled = deferred<ReadableStreamReadResult<Uint8Array>>();
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeStreamResponse({ read: () => stalled.promise, cancel }))
    );
    const result = backendRequest('/v1/session', decodeSession);
    const rejected = expect(result).rejects.toMatchObject({ code: 'unavailable', ambiguous: true });
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not turn malformed success data into a usable authenticated session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          envelope({
            account: { ...session.account },
            csrfToken: 'invalid',
            expiresAt: now + 1000
          })
        )
      )
    );
    await expect(backendRequest('/v1/session', decodeSession)).rejects.toBeInstanceOf(BackendError);
  });
});
