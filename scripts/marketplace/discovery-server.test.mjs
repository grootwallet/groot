import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { test } from 'node:test';
import {
  createDiscoveryMiddleware,
  DISCOVERY_PATH
} from '../../packages/marketplace/discovery-server.mjs';

const SEARCH = `${DISCOVERY_PATH}?intent=buy&amountCents=10000`;
const MAX_BYTES = 512 * 1_024;

function incoming(overrides = {}) {
  return Object.assign(new EventEmitter(), {
    url: SEARCH,
    method: 'GET',
    headers: { host: '127.0.0.1:5195', 'x-groot-marketplace-request': '1' },
    socket: { remoteAddress: '127.0.0.1', encrypted: false },
    complete: true,
    ...overrides
  });
}

class ResponseCapture extends EventEmitter {
  statusCode = 200;
  headers = {};
  body = '';
  destroyed = false;
  writableEnded = false;
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }
  getHeaderNames() {
    return Object.keys(this.headers);
  }
  removeHeader(name) {
    delete this.headers[name.toLowerCase()];
  }
  end(body) {
    this.body = body;
    this.writableEnded = true;
  }
  json() {
    return JSON.parse(this.body);
  }
}

function publicResponse(value = { status: 'success', offers: [] }, options = {}) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    ...options
  });
}

async function run(handler, overrides = {}) {
  const request = incoming(overrides);
  const response = new ResponseCapture();
  let nextCalls = 0;
  await handler(request, response, () => nextCalls++);
  return { request, response, nextCalls };
}

function safeHeaders(response) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
}

test('forwards unrelated paths without any provider request or response', async () => {
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: () => assert.fail('Unrelated paths must not fetch.')
  });
  for (const url of ['/marketplace', '/api/wallet', '/__groot_marketplacex/offers']) {
    const { response, nextCalls } = await run(handler, { url });
    assert.equal(nextCalls, 1);
    assert.equal(response.body, '');
  }
  handler.close();
});

test('relay responses remove CORS headers inherited from a development server', async () => {
  const handler = createDiscoveryMiddleware({
    fetch: async () => publicResponse({ count: 0, results: [] })
  });
  const response = new ResponseCapture();
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  await handler(incoming(), response);
  safeHeaders(response);
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
  handler.close();
});

test('public searches fix the provider origin, method, corridor, opposite side and exact fiat amount', async () => {
  const calls = [];
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async (url, options) => {
      calls.push({ url, options });
      return publicResponse({
        status: 'success',
        offers: [{ id: 'public-offer' }],
        ignored: 'extra'
      });
    }
  });
  for (const [intent, amountCents, side, major] of [
    ['buy', '5000', 'sell', '50.00'],
    ['sell', '25000', 'buy', '250.00'],
    ['buy', '12345', 'sell', '123.45']
  ]) {
    const { response } = await run(handler, {
      url: `${DISCOVERY_PATH}?intent=${intent}&amountCents=${amountCents}`,
      headers: {
        host: 'localhost:5195',
        'x-groot-marketplace-request': '1',
        origin: 'http://localhost:5195',
        'sec-fetch-site': 'same-origin',
        authorization: 'Bearer local-secret',
        cookie: 'session=local-private',
        referer: 'http://localhost:5195/private-wallet'
      }
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      provider: 'hodlhodl',
      payload: { status: 'success', offers: [{ id: 'public-offer' }], ignored: 'extra' }
    });
    safeHeaders(response);
    const call = calls.at(-1);
    const url = new URL(call.url);
    assert.equal(url.origin, 'https://hodlhodl.com');
    assert.equal(url.pathname, '/api/v1/offers');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      'pagination[limit]': '100',
      'pagination[offset]': '0',
      'filters[asset_code]': 'BTC',
      'filters[currency_code]': 'EUR',
      'filters[side]': side,
      'filters[payment_method_id]': '9081',
      'filters[only_working_now]': 'true',
      'filters[amount]': major
    });
    assert.deepEqual(call.options.headers, { Accept: 'application/json' });
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.referrerPolicy, 'no-referrer');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.signal.aborted, false);
  }
  handler.close();
});

test('the default development provider fixes LocalCoinSwap corridor and keeps the amount local', async () => {
  const calls = [];
  const payload = {
    active_page: 1,
    total_pages: 2,
    count: 101,
    next: 'http://api.localcoinswap.com/api/v2/offers/search/?offset=100',
    previous: null,
    offset: 0,
    limit: 100,
    results: [{ uuid: 'public-offer' }]
  };
  const handler = createDiscoveryMiddleware({
    fetch: async (url, options) => {
      calls.push({ url, options });
      return publicResponse(payload);
    }
  });
  for (const [intent, amount, providerSide] of [
    ['buy', '5000', 'sell'],
    ['sell', '25000', 'buy']
  ]) {
    const { response } = await run(handler, {
      url: `${DISCOVERY_PATH}?intent=${intent}&amountCents=${amount}`
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { provider: 'localcoinswap', payload });
    safeHeaders(response);
    const call = calls.at(-1);
    const url = new URL(call.url);
    assert.equal(url.origin, 'https://api.localcoinswap.com');
    assert.equal(url.pathname, '/api/v2/offers/search/');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      coin_currency: 'BTC',
      fiat_currency: 'EUR',
      trading_type: providerSide,
      payment_method: 'sepa-instant',
      last_seen: '30mins',
      limit: '100',
      offset: '0'
    });
    assert.deepEqual(call.options.headers, { Accept: 'application/json' });
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.redirect, 'error');
  }
  assert.equal(calls.length, 2, 'Pagination is never followed.');
  assert.throws(() => createDiscoveryMiddleware({ provider: 'unapproved' }), RangeError);
  assert.throws(() => createDiscoveryMiddleware({ provider: 'https://evil.test' }), RangeError);
  handler.close();
});

test('LocalCoinSwap accepts only a bounded public result page and never falls back to another provider', async () => {
  let upstream;
  const calls = [];
  const handler = createDiscoveryMiddleware({
    provider: 'localcoinswap',
    fetch: async (url) => {
      calls.push(url);
      return upstream;
    }
  });
  for (const payload of [
    { status: 'success', offers: [] },
    { count: 0, results: {} },
    { count: -1, results: [] },
    { count: '1', results: [] },
    { count: Number.MAX_SAFE_INTEGER + 1, results: [] },
    { count: 101, results: Array(101).fill({}) },
    { count: 0, results: [], limit: 101 },
    { count: 0, results: [], limit: 0 }
  ]) {
    upstream = publicResponse(payload);
    const { response } = await run(handler);
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), { code: 'invalid_response' });
  }
  upstream = new Response('internal provider failure', { status: 503 });
  const before = calls.length;
  assert.deepEqual((await run(handler)).response.json(), { code: 'provider_unavailable' });
  assert.equal(calls.length, before + 1);
  assert.equal(
    calls.every((url) => new URL(url).origin === 'https://api.localcoinswap.com'),
    true
  );
  handler.close();
});

test('rejects nonlocal hosts, remote peers, cross-origin metadata and malformed origin headers before fetch', async () => {
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: () => assert.fail('Forbidden request fetched.')
  });
  const forbiddenHeaders = [
    {},
    { host: 'example.com' },
    { host: 'localhost.evil.test' },
    { host: '127.0.0.2:5195' },
    { host: '0.0.0.0:5195' },
    { host: '127.0.0.1:65536' },
    { host: 'user@localhost:5195' },
    { host: 'localhost:5195/path' },
    { host: ['localhost:5195', 'evil.test'] },
    { host: 'localhost:5195', origin: 'null' },
    { host: 'localhost:5195', origin: 'http://127.0.0.1:5195' },
    { host: 'localhost:5195', origin: 'http://localhost:5196' },
    { host: 'localhost:5195', origin: 'https://localhost:5195' },
    { host: 'localhost:5195', origin: 'http://localhost:5195/path' },
    { host: 'localhost:5195', origin: ['http://localhost:5195'] },
    { host: 'localhost:5195', 'sec-fetch-site': 'cross-site' },
    { host: 'localhost:5195', 'sec-fetch-site': 'same-site' },
    { host: 'localhost:5195', 'sec-fetch-site': ['same-origin'] }
  ];
  for (const headers of forbiddenHeaders) {
    const { response } = await run(handler, {
      headers: { 'x-groot-marketplace-request': '1', ...headers }
    });
    assert.equal(response.statusCode, 403, JSON.stringify(headers));
    assert.deepEqual(response.json(), { code: 'forbidden' });
    safeHeaders(response);
  }
  const { response } = await run(handler, { socket: { remoteAddress: '192.0.2.1' } });
  assert.equal(response.statusCode, 403);
  handler.close();
});

test('requires the exact app request marker even when Origin and Fetch Metadata are absent', async () => {
  const handler = createDiscoveryMiddleware({
    fetch: () => assert.fail('Unmarked or malformed marker requests must not fetch.')
  });
  for (const marker of [undefined, '', '0', 'true', ' 1', '1 ', '1, 1', ['1'], ['1', '1'], 1]) {
    const { response } = await run(handler, {
      headers: { host: '127.0.0.1:5195', 'x-groot-marketplace-request': marker }
    });
    assert.equal(response.statusCode, 403, JSON.stringify(marker));
    assert.deepEqual(response.json(), { code: 'forbidden' });
    safeHeaders(response);
  }
  handler.close();
});

test('blocks simple image and form requests and cross-origin preflights before contacting a provider', async () => {
  const handler = createDiscoveryMiddleware({
    fetch: () => assert.fail('Drive-by browser requests must not fetch.')
  });
  for (const overrides of [
    {
      headers: {
        host: '127.0.0.1:5195',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors'
      }
    },
    {
      headers: {
        host: '127.0.0.1:5195',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate'
      }
    },
    {
      method: 'OPTIONS',
      headers: {
        host: '127.0.0.1:5195',
        origin: 'https://untrusted.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-groot-marketplace-request'
      }
    },
    {
      headers: {
        host: '127.0.0.1:5195',
        origin: 'https://untrusted.example',
        'x-groot-marketplace-request': '1'
      }
    }
  ]) {
    const { response } = await run(handler, overrides);
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { code: 'forbidden' });
    safeHeaders(response);
  }
  handler.close();
});

test('rejects duplicate raw marker headers even if a header parser retained one value', async () => {
  const handler = createDiscoveryMiddleware({
    fetch: () => assert.fail('Duplicate marker headers must not fetch.')
  });
  const { response } = await run(handler, {
    rawHeaders: [
      'Host',
      '127.0.0.1:5195',
      'X-Groot-Marketplace-Request',
      '1',
      'x-groot-marketplace-request',
      '1'
    ]
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { code: 'forbidden' });
  safeHeaders(response);
  handler.close();
});

test('accepts a single marked loopback request without treating the marker as authentication', async () => {
  let calls = 0;
  const handler = createDiscoveryMiddleware({
    fetch: async (_url, options) => {
      calls++;
      assert.deepEqual(options.headers, { Accept: 'application/json' });
      return publicResponse({ count: 0, results: [] });
    }
  });
  const { response } = await run(handler, {
    rawHeaders: ['Host', '127.0.0.1:5195', 'X-Groot-Marketplace-Request', '1']
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls, 1);
  safeHeaders(response);
  handler.close();
});

test('supports loopback IPv6, mapped IPv4 and same-origin HTTPS without adding CORS', async () => {
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async () => publicResponse()
  });
  for (const overrides of [
    {
      headers: {
        host: '[::1]:5195',
        origin: 'http://[::1]:5195',
        'x-groot-marketplace-request': '1'
      },
      socket: { remoteAddress: '::1' }
    },
    { socket: { remoteAddress: '::ffff:127.0.0.1' } },
    {
      headers: {
        host: 'localhost:5195',
        'x-groot-marketplace-request': '1',
        origin: 'https://localhost:5195',
        'sec-fetch-site': 'none'
      },
      socket: { remoteAddress: '127.0.0.1', encrypted: true }
    }
  ]) {
    const { response } = await run(handler, overrides);
    assert.equal(response.statusCode, 200);
    safeHeaders(response);
  }
  handler.close();
});

test('allows only GET and an exact, bounded query with no provider forwarding controls', async () => {
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: () => assert.fail('Invalid search fetched.')
  });
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
    const { response } = await run(handler, { method });
    assert.equal(response.statusCode, 405);
    assert.deepEqual(response.json(), { code: 'invalid_request' });
    assert.equal(response.headers.allow, 'GET');
  }
  for (const url of [
    DISCOVERY_PATH,
    '/__groot_marketplace',
    `${DISCOVERY_PATH}/?intent=buy&amountCents=10000`,
    `/__groot_marketplace/other/../offers?intent=buy&amountCents=10000`,
    `${DISCOVERY_PATH}?intent=buy`,
    `${DISCOVERY_PATH}?amountCents=10000`,
    `${DISCOVERY_PATH}?intent=BUY&amountCents=10000`,
    `${DISCOVERY_PATH}?intent=buy&amountCents=4999`,
    `${DISCOVERY_PATH}?intent=buy&amountCents=25001`,
    `${DISCOVERY_PATH}?intent=buy&amountCents=05000`,
    `${DISCOVERY_PATH}?intent=buy&amountCents=5000.0`,
    `${DISCOVERY_PATH}?intent=buy&amountCents=5e3`,
    `${DISCOVERY_PATH}?intent=buy&amountCents=-5000`,
    `${SEARCH}&intent=sell`,
    `${SEARCH}&amountCents=5000`,
    `${SEARCH}&url=https://evil.test`,
    `${SEARCH}&currency=USD`,
    `${SEARCH}&offset=100`,
    `${SEARCH}&provider=localcoinswap`,
    `${SEARCH}#fragment`,
    `${SEARCH}&${'a'.repeat(512)}`
  ]) {
    const { response } = await run(handler, { url });
    assert.equal(response.statusCode, 400, url);
    assert.deepEqual(response.json(), { code: 'invalid_request' });
    safeHeaders(response);
  }
  handler.close();
});

test('requires bounded UTF-8 JSON with the successful public offer envelope', async () => {
  let upstream;
  const handler = createDiscoveryMiddleware({ provider: 'hodlhodl', fetch: async () => upstream });
  const invalidResponses = [
    new Response('<html>provider error</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{}'),
    new Response('{}', { headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }),
    publicResponse(
      { status: 'success', offers: [] },
      { headers: { 'Content-Length': `${MAX_BYTES + 1}`, 'Content-Type': 'application/json' } }
    ),
    publicResponse(
      { status: 'success', offers: [] },
      { headers: { 'Content-Length': '-1', 'Content-Type': 'application/json' } }
    ),
    new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } }),
    new Response('{invalid', { headers: { 'Content-Type': 'application/json' } }),
    publicResponse({ status: 'error', error: 'do not disclose internal message' }),
    publicResponse(null),
    publicResponse([]),
    publicResponse({ status: 'success', offers: {} }),
    publicResponse({ status: 'success', offers: Array(101).fill({}) }),
    new Response(null, { headers: { 'Content-Type': 'application/json' } })
  ];
  for (const candidate of invalidResponses) {
    upstream = candidate;
    const { response } = await run(handler);
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), { code: 'invalid_response' });
    safeHeaders(response);
  }
  handler.close();
});

test('bounds actual streamed bytes regardless of Content-Length and cancels rejected streams', async () => {
  let cancelled = false;
  let upstream;
  const handler = createDiscoveryMiddleware({ provider: 'hodlhodl', fetch: async () => upstream });
  const envelope = JSON.stringify({ status: 'success', offers: [] });
  upstream = new Response(`${envelope}${' '.repeat(MAX_BYTES - envelope.length)}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal((await run(handler)).response.statusCode, 200);

  upstream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(envelope));
        controller.enqueue(new Uint8Array(MAX_BYTES));
      },
      cancel() {
        cancelled = true;
      }
    }),
    { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } }
  );
  const { response } = await run(handler);
  assert.deepEqual(response.json(), { code: 'invalid_response' });
  assert.equal(cancelled, true);
  handler.close();
});

test('the final provider wrapper cannot make the relay response exceed the byte limit', async () => {
  const envelope = { status: 'success', offers: [{ description: '' }] };
  envelope.offers[0].description = 'a'.repeat(MAX_BYTES - JSON.stringify(envelope).length);
  assert.equal(new TextEncoder().encode(JSON.stringify(envelope)).byteLength, MAX_BYTES);
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async () => publicResponse(envelope)
  });
  const { response } = await run(handler);
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), { code: 'invalid_response' });
  handler.close();
});

test('preserves split UTF-8 code points and treats body stream errors as invalid responses', async () => {
  let upstream;
  const handler = createDiscoveryMiddleware({ provider: 'hodlhodl', fetch: async () => upstream });
  const encoded = new TextEncoder().encode(
    JSON.stringify({ status: 'success', offers: [{ alias: '€' }] })
  );
  const split = encoded.indexOf(0xe2) + 1;
  upstream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.slice(0, split));
        controller.enqueue(encoded.slice(split));
        controller.close();
      }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  assert.deepEqual((await run(handler)).response.json(), {
    provider: 'hodlhodl',
    payload: {
      status: 'success',
      offers: [{ alias: '€' }]
    }
  });
  upstream = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error('private upstream connection detail'));
      }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  assert.deepEqual((await run(handler)).response.json(), { code: 'invalid_response' });
  handler.close();
});

test('classifies provider failures without exposing arbitrary upstream error bodies or following redirects', async () => {
  let upstream;
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async () => {
      if (upstream instanceof Error) throw upstream;
      return upstream;
    }
  });
  for (const status of [201, 301, 302, 401, 403, 404, 500, 503]) {
    upstream = new Response('private upstream response', { status });
    const { response } = await run(handler);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { code: 'provider_unavailable' });
  }
  upstream = new Error('private network detail');
  assert.deepEqual((await run(handler)).response.json(), { code: 'provider_unavailable' });
  upstream = publicResponse();
  Object.defineProperty(upstream, 'redirected', { value: true });
  assert.deepEqual((await run(handler)).response.json(), { code: 'invalid_response' });
  upstream = publicResponse();
  Object.defineProperty(upstream, 'url', { value: 'https://evil.test/api/v1/offers' });
  assert.deepEqual((await run(handler)).response.json(), { code: 'invalid_response' });
  handler.close();
});

test('deadline includes response headers and body; timeout aborts and releases the process slot', async () => {
  let signal;
  const headerTimeout = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    timeoutMs: 15,
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    }
  });
  assert.deepEqual((await run(headerTimeout)).response.json(), { code: 'provider_unavailable' });
  assert.equal(signal.aborted, true);
  headerTimeout.close();

  let cancelled = false;
  const bodyTimeout = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    timeoutMs: 15,
    fetch: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          }
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
  });
  assert.deepEqual((await run(bodyTimeout)).response.json(), { code: 'provider_unavailable' });
  assert.equal(cancelled, true);
  bodyTimeout.close();
  const healthy = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async () => publicResponse()
  });
  assert.equal((await run(healthy)).response.statusCode, 200);
  healthy.close();
  for (const timeoutMs of [0, -1, 8_001, 1.5, NaN]) {
    assert.throws(() => createDiscoveryMiddleware({ provider: 'hodlhodl', timeoutMs }), RangeError);
  }
});

test('caps all middleware instances at two concurrent requests, and close cancels only owned work', async () => {
  const signals = [];
  const slowFetch = async (_url, options) => {
    signals.push(options.signal);
    return new Promise(() => {});
  };
  const first = createDiscoveryMiddleware({ provider: 'hodlhodl', fetch: slowFetch });
  const second = createDiscoveryMiddleware({ provider: 'localcoinswap', fetch: slowFetch });
  const third = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async () => publicResponse()
  });
  const pendingFirst = run(first);
  const pendingSecond = run(second);
  const blocked = await run(third);
  assert.equal(blocked.response.statusCode, 503);
  assert.deepEqual(blocked.response.json(), { code: 'busy' });
  first.close();
  assert.deepEqual((await pendingFirst).response.json(), { code: 'provider_unavailable' });
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.equal((await run(third)).response.statusCode, 200);
  assert.deepEqual((await run(first)).response.json(), { code: 'provider_unavailable' });
  second.close();
  await pendingSecond;
  third.close();
});

test('request abortion and early response close cancel upstream without writing a late response', async () => {
  let signal;
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    }
  });
  for (const event of ['aborted', 'close']) {
    const request = incoming();
    const response = new ResponseCapture();
    const pending = handler(request, response);
    (event === 'aborted' ? request : response).emit(event);
    await pending;
    assert.equal(signal.aborted, true);
    assert.equal(response.body, '');
    assert.equal(request.listenerCount('aborted'), 0);
    assert.equal(response.listenerCount('close'), 0);
  }
  handler.close();
});

test('a request already aborted or response already closed cannot start upstream work', async () => {
  const handler = createDiscoveryMiddleware({
    fetch: () => assert.fail('Closed request fetched.')
  });
  assert.equal((await run(handler, { aborted: true })).response.body, '');
  for (const state of ['destroyed', 'writableEnded']) {
    const response = new ResponseCapture();
    response[state] = true;
    await handler(incoming(), response);
    assert.equal(response.body, '');
  }
  handler.close();
});

test('closing cancels a response body which arrives after an uncooperative fetch has already been aborted', async () => {
  let deliver;
  let cancelled = false;
  const handler = createDiscoveryMiddleware({
    fetch: async () =>
      new Promise((resolve) => {
        deliver = resolve;
      })
  });
  const pending = run(handler);
  handler.close();
  const { response } = await pending;
  assert.deepEqual(response.json(), { code: 'provider_unavailable' });
  deliver(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        }
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cancelled, true);
  assert.deepEqual(response.json(), { code: 'provider_unavailable' });
});

test('Node HTTP lifecycle objects preserve a completed request and cancel an early response close without binding a port', async () => {
  let signal;
  let resolveFetch;
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    }
  });
  function httpObjects() {
    const socket = new Socket();
    const request = new IncomingMessage(socket);
    request.url = SEARCH;
    request.method = 'GET';
    request.headers.host = '127.0.0.1:5195';
    request.headers['x-groot-marketplace-request'] = '1';
    request.complete = true;
    return { socket, request, response: new ServerResponse(request) };
  }
  const completed = httpObjects();
  const pendingCompleted = handler(completed.request, completed.response);
  completed.request.emit('close');
  assert.equal(signal.aborted, false);
  resolveFetch(publicResponse());
  await pendingCompleted;
  assert.equal(completed.response.statusCode, 200);
  assert.equal(completed.response.writableEnded, true);
  assert.equal(signal.aborted, false);
  completed.socket.destroy();

  const disconnected = httpObjects();
  const pendingDisconnected = handler(disconnected.request, disconnected.response);
  disconnected.response.emit('close');
  await pendingDisconnected;
  assert.equal(signal.aborted, true);
  assert.equal(disconnected.response.writableEnded, false);
  disconnected.socket.destroy();
  handler.close();
});

test('provider 429 triggers a shared sixty-second cooldown with no automatic retries', async () => {
  let time = Date.now();
  let calls = 0;
  const handler = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    now: () => time,
    fetch: async () => {
      calls++;
      return calls === 1
        ? publicResponse({ private: 'upstream rate detail' }, { status: 429 })
        : publicResponse();
    }
  });
  const second = createDiscoveryMiddleware({
    provider: 'hodlhodl',
    now: () => time,
    fetch: () => assert.fail('Cooldown bypassed.')
  });
  const limited = await run(handler);
  assert.equal(limited.response.statusCode, 429);
  assert.deepEqual(limited.response.json(), { code: 'rate_limited' });
  assert.equal(limited.response.headers['retry-after'], '60');
  safeHeaders(limited.response);
  const otherProvider = createDiscoveryMiddleware({
    provider: 'localcoinswap',
    fetch: async () => publicResponse({ count: 0, results: [] })
  });
  assert.equal((await run(otherProvider)).response.statusCode, 200);
  otherProvider.close();
  assert.deepEqual((await run(second)).response.json(), { code: 'rate_limited' });
  time += 59_999;
  const nearlyReady = await run(handler);
  assert.deepEqual(nearlyReady.response.json(), { code: 'rate_limited' });
  assert.equal(nearlyReady.response.headers['retry-after'], '1');
  assert.equal(calls, 1);
  time += 1;
  assert.equal((await run(handler)).response.statusCode, 200);
  assert.equal(calls, 2);
  handler.close();
  second.close();
});

test('numeric upstream Retry-After blocks external fetches for the full requested interval', async () => {
  let time = Date.now();
  let calls = 0;
  const handler = createDiscoveryMiddleware({
    now: () => time,
    fetch: async () => {
      calls++;
      return calls === 1
        ? publicResponse({}, { status: 429, headers: { 'Retry-After': '600' } })
        : publicResponse({ count: 0, results: [] });
    }
  });
  const first = (await run(handler)).response;
  assert.equal(first.headers['retry-after'], '600');
  time += 60_000;
  const early = (await run(handler)).response;
  assert.deepEqual(early.json(), { code: 'rate_limited' });
  assert.equal(early.headers['retry-after'], '540');
  assert.equal(calls, 1);
  time += 540_000 - 1;
  assert.equal((await run(handler)).response.headers['retry-after'], '1');
  assert.equal(calls, 1);
  time += 1;
  assert.equal((await run(handler)).response.statusCode, 200);
  assert.equal(calls, 2);
  handler.close();
});

test('HTTP-date Retry-After is respected and never replaced with an earlier fixed retry', async () => {
  let time = Math.floor(Date.now() / 1_000) * 1_000;
  const deadline = new Date(time + 180_000).toUTCString();
  let calls = 0;
  const handler = createDiscoveryMiddleware({
    now: () => time,
    fetch: async () => {
      calls++;
      return calls === 1
        ? publicResponse({}, { status: 429, headers: { 'Retry-After': deadline } })
        : publicResponse({ count: 0, results: [] });
    }
  });
  assert.equal((await run(handler)).response.headers['retry-after'], '180');
  time += 179_999;
  assert.equal((await run(handler)).response.headers['retry-after'], '1');
  assert.equal(calls, 1);
  time += 1;
  assert.equal((await run(handler)).response.statusCode, 200);
  assert.equal(calls, 2);
  handler.close();
});

test('malformed upstream Retry-After uses sixty seconds and excessive waits are capped at twenty-four hours', async () => {
  for (const [value, seconds] of [
    ['not-a-date', 60],
    ['-1', 60],
    ['0', 60],
    ['1e3', 60],
    ['Thu, 99 Foo 2026 99:99:99 GMT', 60],
    ['9999999999', 86_400]
  ]) {
    let time = Date.now();
    let calls = 0;
    const handler = createDiscoveryMiddleware({
      now: () => time,
      fetch: async () => {
        calls++;
        return calls === 1
          ? publicResponse({}, { status: 429, headers: { 'Retry-After': value } })
          : publicResponse({ count: 0, results: [] });
      }
    });
    assert.equal((await run(handler)).response.headers['retry-after'], String(seconds));
    time += Number(seconds) * 1_000 - 1;
    assert.equal((await run(handler)).response.headers['retry-after'], '1');
    assert.equal(calls, 1);
    time += 1;
    assert.equal((await run(handler)).response.statusCode, 200);
    assert.equal(calls, 2);
    handler.close();
  }
});

test('concurrent provider 429 responses preserve the longest existing cooldown', async () => {
  let time = Date.now();
  const deliveries = [];
  let calls = 0;
  const handler = createDiscoveryMiddleware({
    now: () => time,
    fetch: async () => {
      calls++;
      if (calls <= 2) return new Promise((resolve) => deliveries.push(resolve));
      return publicResponse({ count: 0, results: [] });
    }
  });
  const first = run(handler);
  const second = run(handler);
  assert.equal(calls, 2);
  deliveries[0](publicResponse({}, { status: 429, headers: { 'Retry-After': '600' } }));
  assert.equal((await first).response.headers['retry-after'], '600');
  deliveries[1](publicResponse({}, { status: 429, headers: { 'Retry-After': '60' } }));
  assert.equal((await second).response.headers['retry-after'], '600');
  time += 60_000;
  assert.equal((await run(handler)).response.headers['retry-after'], '540');
  assert.equal(calls, 2);
  time += 540_000;
  assert.equal((await run(handler)).response.statusCode, 200);
  assert.equal(calls, 3);
  handler.close();
});
