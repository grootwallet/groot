import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duplex } from 'node:stream';
import { test } from 'node:test';
import {
  createLocalCoinSwapFixtureFetch,
  LOCALCOINSWAP_FIXTURE_KEY,
  LOCALCOINSWAP_FIXTURE_OFFERS as offers,
  LOCALCOINSWAP_FIXTURE_TRADES as trades
} from '../../packages/marketplace/localcoinswap-fixture.mjs';
import {
  createLocalCoinSwapGateway,
  LOCALCOINSWAP_API_BASE as base
} from '../../packages/marketplace/localcoinswap-gateway.mjs';
import { createLocalCoinSwapProvider } from '../../packages/marketplace/localcoinswap-provider.mjs';

const host = '127.0.0.1:5296';
const origin = `http://${host}`;
const accessToken = 'groot_test_transport_token_0123456789_abcdef';
const buyerPath = `/trades/${trades.buy}`;
const buyerMessages = `${buyerPath}/messages`;
const buyerActions = `${buyerPath}/actions`;
const market = '/offers?intent=buy&amountCents=10000&country=FR';
const paid = { action: 'mark_paid', expectedStatus: 'CRYPTO_ESC' };

// Exercise Node's real HTTP request parser, header serialization and streams without a TCP bind.
function httpConnection(server) {
  function socket(peer) {
    return Object.assign(
      new Duplex({
        read() {},
        write(chunk, _encoding, callback) {
          peer().push(chunk);
          callback();
        },
        final(callback) {
          if (!peer().destroyed) peer().push(null);
          callback();
        }
      }),
      { remoteAddress: '127.0.0.1' }
    );
  }
  const client = socket(() => serverSocket);
  const serverSocket = socket(() => client);
  server.emit('connection', serverSocket);
  return {
    client,
    close() {
      client.destroy();
      serverSocket.destroy();
    }
  };
}

function start(
  t,
  { mode = 'fixture', fetcher, now, writeEnabled, journalPath, accountScope = 'a'.repeat(64) } = {}
) {
  const provider = createLocalCoinSwapProvider({
    apiKey: LOCALCOINSWAP_FIXTURE_KEY,
    fetcher: fetcher ?? createLocalCoinSwapFixtureFetch({ now }),
    now
  });
  const gateway = createLocalCoinSwapGateway({
    mode,
    provider,
    origin,
    accessToken: mode === 'account' ? accessToken : undefined,
    accountScope,
    writeEnabled,
    journalPath
  });
  const server = createServer((req, res) => {
    Promise.resolve(gateway(req, res, () => res.writeHead(404).end())).catch((error) =>
      res.destroy(error)
    );
  });
  t.after(() => gateway.close());
  function call(path, { method = 'GET', body, rawBody, headers = {}, auth = true } = {}) {
    const requestHeaders = {
      'X-Groot-LocalCoinSwap': '1',
      Connection: 'close',
      ...(mode === 'account' && auth ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers
    };
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (value === undefined) delete requestHeaders[key];
    }
    const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const connection = httpConnection(server);
      const req = httpRequest(
        `${origin}${base}${path}`,
        {
          method,
          headers: requestHeaders,
          agent: null,
          createConnection: () => connection.client
        },
        (res) => {
          res.setEncoding('utf8');
          let responseBody = '';
          res.on('data', (chunk) => (responseBody += chunk));
          res.on('error', reject);
          res.on('end', () => {
            connection.close();
            try {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: responseBody && JSON.parse(responseBody)
              });
            } catch (error) {
              reject(error);
            }
          });
        }
      );
      req.on('error', (error) => {
        connection.close();
        reject(error);
      });
      req.end(payload);
    });
  }
  return Object.assign(call, { close: () => gateway.close() });
}

function post(call, path, body, key = randomUUID(), headers = {}) {
  return call(path, {
    method: 'POST',
    body,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      ...headers
    }
  });
}

function result(response, status = 200) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.body.apiVersion, 1);
  assert.ok(Object.hasOwn(response.body, 'data'));
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  return response.body.data;
}

function error(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.body.apiVersion, 1);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.retryable, 'boolean');
  assert.deepEqual(Object.keys(response.body).sort(), ['apiVersion', 'error']);
  return response.body.error;
}

test('fixture offers and trades cross the real HTTP adapter with integer amounts and allowlisted data', async (t) => {
  const call = start(t);
  const capabilities = result(await call('/capabilities'));
  assert.equal(capabilities.mode, 'fixture');
  assert.equal(capabilities.authenticated, true);
  assert.equal(capabilities.tradeActions, true);
  assert.equal(capabilities.btcExecution, false);

  const buy = result(await call(market)).items;
  assert.equal(buy.length, 1);
  assert.equal(buy[0].id, offers.buy);
  assert.equal(buy[0].intent, 'buy');
  assert.equal(buy[0].pricePerBtcCents, 8_000_000);
  assert.equal(buy[0].minFiatCents, 5_000);
  assert.equal(buy[0].maxFiatCents, 25_000);
  const sell = result(await call(market.replace('intent=buy', 'intent=sell'))).items;
  assert.equal(sell.length, 1);
  assert.equal(sell[0].id, offers.sell);
  assert.equal(sell[0].intent, 'sell');
  assert.equal(sell[0].pricePerBtcCents, 7_950_000);
  assert.deepEqual(result(await call(market.replace('country=FR', 'country=DE'))).items, []);
  assert.equal(result(await call(`/offers/${offers.buy}`)).id, offers.buy);
  error(await call(`/offers/${randomUUID()}`), 404, 'not_found');

  const first = result(await call('/trades?stage=live&limit=1'));
  assert.equal(first.total, 3);
  assert.equal(first.items.length, 1);
  assert.equal(first.nextOffset, 1);
  const second = result(await call(`/trades?stage=live&limit=1&offset=${first.nextOffset}`));
  assert.equal(second.items.length, 1);
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal(second.nextOffset, 2);
  const past = result(await call('/trades?stage=past')).items;
  assert.deepEqual(
    past.map(({ id, status }) => [id, status]),
    [[trades.past, 'COMPLETED']]
  );
  const detail = result(await call(buyerPath));
  assert.equal(detail.id, trades.buy);
  assert.equal(detail.status, 'CRYPTO_ESC');
  assert.equal(detail.fiatCents, 10_000);
  assert.equal(detail.bitcoinSats, 125_000);
  assert.equal(detail.buyer, 'groot-tester');
  assert.doesNotMatch(
    JSON.stringify(detail),
    /fixture-(?:buyer|seller|witness|escrow|fee)|btc_escrow|tx_meta/
  );
  error(await call(`/trades/${randomUUID()}`), 404, 'not_found');
});

test('latest chat returns the verified tail and preserves explicit offset pagination', async (t) => {
  const call = start(t);
  const first = result(await call(`${buyerMessages}?limit=1&offset=0`));
  assert.equal(first.items[0].sender, 'Camille');
  assert.equal(first.nextOffset, 1);
  assert.equal('offset' in first, false);
  const message = result(
    await post(call, buyerMessages, { content: 'A new message at the tail.' }),
    201
  );
  const latest = result(await call(`${buyerMessages}?view=latest&limit=1`));
  assert.deepEqual(latest, { items: [message], total: 3, offset: 2, nextOffset: null });
  error(await call(`${buyerMessages}?view=latest&offset=0`), 400, 'invalid_request');
  error(await call(`${buyerMessages}?view=earliest`), 400, 'invalid_request');
  error(await call(`${buyerMessages}?view=latest&view=latest`), 400, 'invalid_request');
});

test('trade chat, payment and disputes persist, with retry-safe writes and stale-status checks', async (t) => {
  const fixture = createLocalCoinSwapFixtureFetch();
  const writes = [];
  const call = start(t, {
    fetcher(input, init) {
      if (init.method !== 'GET') writes.push([new URL(input).pathname, init.method, init.body]);
      return fixture(input, init);
    }
  });
  const initialMessages = result(await call(`${buyerMessages}?limit=1`));
  assert.equal(initialMessages.total, 2);
  assert.equal(initialMessages.nextOffset, 1);
  assert.equal(initialMessages.items[0].sender, 'Camille');

  const key = randomUUID();
  const content = { content: 'I will use the payment instructions. ✅' };
  const message = result(await post(call, buyerMessages, content, key), 201);
  assert.equal(message.content, content.content);
  assert.equal(message.sender, 'groot-tester');
  assert.deepEqual(result(await post(call, buyerMessages, content, key), 201), message);
  error(await post(call, buyerMessages, { content: 'Different content' }, key), 409, 'conflict');
  const chat = result(await call(`${buyerMessages}?offset=2`));
  assert.equal(chat.total, 3);
  assert.deepEqual(chat.items, [message]);
  assert.equal(writes.length, 1);

  const paidKey = randomUUID();
  assert.equal(result(await post(call, buyerActions, paid, paidKey)).status, 'FUND_PAID');
  assert.equal(result(await post(call, buyerActions, paid, paidKey)).status, 'FUND_PAID');
  assert.equal(result(await call(buyerPath)).status, 'FUND_PAID');
  assert.equal(result(await call(`/operations/${paidKey}`)).status, 'succeeded');
  error(await post(call, buyerActions, paid), 409, 'wrong_trade_state');
  error(await post(call, `/trades/${trades.sell}/actions`, paid), 409, 'wrong_trade_state');

  const dispute = {
    action: 'open_dispute',
    expectedStatus: 'FUND_PAID',
    description: 'Payment is still pending.'
  };
  assert.equal(result(await post(call, buyerActions, dispute)).status, 'DISPUTED');
  assert.equal(result(await call(buyerPath)).status, 'DISPUTED');
  const withdraw = { action: 'withdraw_dispute', expectedStatus: 'DISPUTED' };
  assert.equal(result(await post(call, buyerActions, withdraw)).status, 'FUND_PAID');
  assert.equal(result(await call(buyerPath)).status, 'FUND_PAID');
  assert.deepEqual(writes, [
    [`/api/v2/trades/message/${trades.buy}/`, 'POST', JSON.stringify(content)],
    [`/api/v2/trades/non-custodial/update/${trades.buy}/`, 'PATCH', '{"status":"FUND_PAID"}'],
    [
      `/api/v2/trades/dispute/${trades.buy}/`,
      'POST',
      JSON.stringify({ description: dispute.description })
    ],
    [`/api/v2/trades/withdraw-dispute/${trades.buy}/`, 'POST', undefined]
  ]);
});

test('account access, loopback host, origin, browser marker and malformed requests fail closed', async (t) => {
  const fixture = createLocalCoinSwapFixtureFetch();
  const calls = [];
  const call = start(t, {
    mode: 'account',
    fetcher(input, init) {
      calls.push([new URL(input).pathname, init.headers.get('authorization')]);
      return fixture(input, init);
    }
  });
  error(await call(buyerPath, { auth: false }), 401, 'unauthorized');
  error(
    await call(buyerPath, { headers: { Authorization: `ApiKey ${LOCALCOINSWAP_FIXTURE_KEY}` } }),
    401,
    'unauthorized'
  );
  for (const headers of [
    { 'X-Groot-LocalCoinSwap': undefined },
    { Host: 'rebind.example' },
    { Origin: 'https://cross-origin.example' },
    { Origin: 'null' },
    { 'Sec-Fetch-Site': 'cross-site' }
  ]) {
    error(await call(market, { headers }), 403, 'forbidden');
  }
  error(
    await call(market, { headers: { 'X-Groot-LocalCoinSwap': ['1', '1'] } }),
    400,
    'invalid_request'
  );
  error(await call('/offers?intent=buy&amountCents=999999'), 400, 'invalid_request');
  error(await call(`${market}&intent=sell`), 400, 'invalid_request');
  error(await call(`${market}&redirect=https://example.net`), 400, 'invalid_request');
  error(await call(buyerPath, { method: 'PUT' }), 405, 'method_not_allowed');
  error(await post(call, buyerMessages, { content: 'Read-only' }), 403, 'writes_disabled');
  assert.equal(calls.length, 0);

  const capabilities = result(await call('/capabilities', { auth: false }));
  assert.equal(capabilities.authenticated, false);
  assert.equal(capabilities.tradeActions, false);
  assert.equal(result(await call(market, { auth: false })).items.length, 1);
  assert.equal(result(await call(buyerPath)).status, 'CRYPTO_ESC');
  assert.deepEqual(calls, [
    ['/api/v2/offers/search/', null],
    [`/api/v2/trades/${trades.buy}/`, `ApiKey ${LOCALCOINSWAP_FIXTURE_KEY}`]
  ]);
});

test('transaction history is paginated and read-only with account access required', async (t) => {
  const fixture = createLocalCoinSwapFixtureFetch();
  const calls = [];
  const call = start(t, {
    mode: 'account',
    fetcher(input, init) {
      const url = new URL(input);
      calls.push([init.method, url.pathname, url.search, init.headers.get('authorization')]);
      return fixture(input, init);
    }
  });
  error(await call('/transactions', { auth: false }), 401, 'unauthorized');
  error(await call('/transactions?type=INVALID'), 400, 'invalid_request');
  error(await call('/transactions?type=DEPOSIT&type=WITHDRAW'), 400, 'invalid_request');
  error(await call('/transactions?txtype=DEPOSIT'), 400, 'invalid_request');
  error(await call('/transactions?limit=101'), 400, 'invalid_request');
  const denied = await post(call, '/transactions', { type: 'DEPOSIT' });
  error(denied, 405, 'method_not_allowed');
  assert.equal(denied.headers.allow, 'GET');
  assert.deepEqual(calls, []);

  const first = result(await call('/transactions?limit=1'));
  assert.equal(first.total, 3);
  assert.equal(first.nextOffset, 1);
  assert.equal(first.items[0].type, 'ESCROW_RELEASE');
  assert.equal(first.items[0].sats, 125_000);
  assert.equal(first.items[0].confirmed, true);
  assert.equal(first.items[0].txid, '7'.repeat(64));
  assert.doesNotMatch(JSON.stringify(first), /ref_data|fixture-transaction-address|secret/);

  const second = result(await call('/transactions?limit=1&offset=1'));
  assert.equal(second.nextOffset, 2);
  assert.equal(second.items[0].type, 'WITHDRAW');
  assert.equal(second.items[0].sats, -50_000);
  assert.equal(second.items[0].confirmed, false);
  assert.equal(second.items[0].txid, null);
  const filtered = result(await call('/transactions?type=DEPOSIT'));
  assert.equal(filtered.nextOffset, null);
  assert.deepEqual(
    filtered.items.map(({ type }) => type),
    ['DEPOSIT']
  );
  assert.deepEqual(
    calls,
    ['?limit=1&offset=0', '?limit=1&offset=1', '?limit=20&offset=0&txtype=DEPOSIT'].map((query) => [
      'GET',
      '/api/v2/tx-history/non-custodial/BTC/',
      query,
      `ApiKey ${LOCALCOINSWAP_FIXTURE_KEY}`
    ])
  );
});

test('read-only account verification accepts an empty trade list and blocks all gateway writes', async (t) => {
  const fixture = createLocalCoinSwapFixtureFetch();
  const calls = [];
  const call = start(t, {
    mode: 'account',
    writeEnabled: false,
    async fetcher(input, init) {
      const url = new URL(input);
      calls.push([init.method, url.pathname, init.headers.get('authorization')]);
      if (url.pathname === '/api/v2/trades/list/') {
        assert.equal(url.searchParams.get('stage'), 'live');
        return Response.json({ count: 0, results: [] });
      }
      return fixture(input, init);
    }
  });

  assert.deepEqual(result(await call('/capabilities')), {
    mode: 'account',
    authenticated: true,
    tradeActions: false,
    btcExecution: false
  });
  assert.deepEqual(result(await call('/trades?stage=live&limit=20')), {
    items: [],
    nextOffset: null,
    total: 0
  });
  error(await post(call, buyerMessages, { content: 'Read-only check' }), 403, 'writes_disabled');
  error(await post(call, buyerActions, paid), 403, 'writes_disabled');
  assert.deepEqual(calls, [['GET', '/api/v2/trades/list/', `ApiKey ${LOCALCOINSWAP_FIXTURE_KEY}`]]);
});

test('only an unaccepted request can be cancelled and funded payment problems can be disputed', async (t) => {
  const fixture = createLocalCoinSwapFixtureFetch();
  const mutations = [];
  const call = start(t, {
    fetcher: (input, init) => {
      if (init.method !== 'GET') mutations.push(JSON.parse(init.body ?? '{}'));
      return fixture(input, init);
    }
  });
  const cancel = { action: 'cancel_unfunded', expectedStatus: 'CREATED' };
  const requested = `/trades/${trades.requested}`;
  error(await post(call, buyerActions, cancel), 409, 'wrong_trade_state');
  error(
    await post(call, buyerActions, { ...cancel, expectedStatus: 'CRYPTO_ESC' }),
    409,
    'wrong_trade_state'
  );
  assert.deepEqual(mutations, []);

  const key = randomUUID();
  const cancelled = result(await post(call, requested + '/actions', cancel, key));
  assert.equal(cancelled.status, 'CANCELLED');
  assert.deepEqual(result(await post(call, requested + '/actions', cancel, key)), cancelled);
  assert.ok(
    result(await call('/trades?stage=past')).items.some((item) => item.id === trades.requested)
  );

  const dispute = {
    action: 'open_dispute',
    expectedStatus: 'CRYPTO_ESC',
    description: 'The payment deadline passed.'
  };
  assert.equal(result(await post(call, buyerActions, dispute)).status, 'DISPUTED');
  const withdraw = { action: 'withdraw_dispute', expectedStatus: 'DISPUTED' };
  assert.equal(result(await post(call, buyerActions, withdraw)).status, 'CRYPTO_ESC');
  assert.deepEqual(mutations, [{ status: 'CANCELLED' }, { description: dispute.description }, {}]);
});

test('mutation guard rejects missing and malformed inputs before contacting the provider', async (t) => {
  const call = start(t, {
    fetcher: () => assert.fail('No invalid mutation may reach the provider.')
  });
  const key = randomUUID();
  const content = { content: 'Ready' };
  for (const [headers, status, code] of [
    [{ Origin: undefined }, 403, 'forbidden'],
    [{ Origin: 'https://cross-origin.example' }, 403, 'forbidden'],
    [{ 'Content-Type': 'text/plain' }, 415, 'unsupported_media_type'],
    [{ 'Content-Encoding': 'gzip' }, 415, 'unsupported_media_type'],
    [{ 'Idempotency-Key': 'invalid' }, 400, 'invalid_request']
  ]) {
    error(await post(call, buyerMessages, content, key, headers), status, code);
  }
  error(await post(call, buyerMessages, { content: '   ' }), 400, 'invalid_request');
  error(await post(call, buyerMessages, { content: 'x'.repeat(1001) }), 400, 'invalid_request');
  error(await post(call, buyerMessages, { content: 'Ready', extra: true }), 400, 'invalid_request');
  error(
    await post(call, buyerActions, { action: 'release', expectedStatus: 'FUND_PAID' }),
    400,
    'invalid_request'
  );
  error(
    await post(call, buyerActions, { action: 'open_dispute', expectedStatus: 'FUND_PAID' }),
    400,
    'invalid_request'
  );
  error(
    await call(buyerMessages, {
      method: 'POST',
      rawBody: '{"content":',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key }
    }),
    400,
    'invalid_request'
  );
  error(
    await call(buyerMessages, {
      method: 'POST',
      rawBody: '{"content":"First","content":"Second"}',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key }
    }),
    400,
    'invalid_request'
  );
  error(
    await post(call, buyerMessages, { content: 'x'.repeat(9_000) }, key),
    413,
    'payload_too_large'
  );
});

test('parallel writes to the same trade reserve once and expose a pending receipt', async (t) => {
  const fixture = createLocalCoinSwapFixtureFetch();
  const held = Promise.withResolvers();
  const entered = Promise.withResolvers();
  let sends = 0;
  const call = start(t, {
    async fetcher(input, init) {
      if (init.method === 'POST') {
        sends++;
        entered.resolve();
        await held.promise;
      }
      return fixture(input, init);
    }
  });
  const content = { content: 'This message is still being sent.' };
  const key = randomUUID();
  const pending = post(call, buyerMessages, content, key);
  try {
    await Promise.race([
      entered.promise,
      pending.then((response) => assert.fail(JSON.stringify(response.body)))
    ]);
    assert.equal(result(await call(`/operations/${key}`)).status, 'pending');
    error(await post(call, buyerMessages, content, key), 409, 'operation_pending');
    error(
      await post(call, buyerMessages, { content: 'Another message' }),
      409,
      'operation_pending'
    );
    assert.equal(sends, 1);
  } finally {
    held.resolve();
    assert.equal(result(await pending, 201).content, content.content);
  }
  assert.equal(result(await call(`/operations/${key}`)).status, 'succeeded');
});

test('a lost mutation response after upstream commit cannot create a duplicate with the same or new key', async (t) => {
  const fixture = createLocalCoinSwapFixtureFetch();
  let sends = 0;
  const call = start(t, {
    async fetcher(input, init) {
      const response = await fixture(input, init);
      if (init.method === 'POST') {
        sends++;
        assert.equal(response.status, 201);
        throw new Error('private upstream failure diagnostic');
      }
      return response;
    }
  });
  const content = { content: 'This delivery will be ambiguous.\r\nKeep it once.' };
  const equivalent = { content: content.content.replace('\r\n', '\n') };
  const key = randomUUID();
  for (const [retryKey, message] of [
    [key, content],
    [key, equivalent],
    [randomUUID(), equivalent]
  ]) {
    const response = await post(call, buyerMessages, message, retryKey);
    error(response, 409, 'operation_unknown');
    assert.doesNotMatch(JSON.stringify(response.body), /private upstream failure/);
  }
  assert.equal(sends, 1);
  assert.equal(result(await call(`/operations/${key}`)).status, 'unknown');
  const messages = result(await call(buyerMessages)).items;
  assert.equal(messages.filter((message) => message.content === equivalent.content).length, 1);
});

test('provider rate limits apply to reads in the same scope and recover without exposing upstream bodies', async (t) => {
  let clock = Date.UTC(2026, 10, 11, 9);
  const now = () => clock;
  const fixture = createLocalCoinSwapFixtureFetch({ now });
  let searches = 0;
  const call = start(t, {
    now,
    fetcher(input, init) {
      if (new URL(input).pathname === '/api/v2/offers/search/' && ++searches === 1) {
        return Promise.resolve(
          Response.json(
            { detail: 'private provider throttle diagnostic' },
            { status: 429, headers: { 'Retry-After': '2' } }
          )
        );
      }
      return fixture(input, init);
    }
  });
  const limited = await call(market);
  assert.equal(error(limited, 429, 'rate_limited').retryAfterSeconds, 2);
  assert.doesNotMatch(JSON.stringify(limited.body), /private provider throttle diagnostic/);
  assert.equal(error(await call(market), 429, 'rate_limited').retryAfterSeconds, 2);
  assert.equal(searches, 1);
  assert.equal(result(await call(buyerPath)).status, 'CRYPTO_ESC');
  clock += 2_000;
  assert.equal(result(await call(market)).items.length, 1);
  assert.equal(searches, 2);
});

test('a definite write rejection replays with Retry-After and a new operation can proceed after backoff', async (t) => {
  let clock = Date.UTC(2026, 10, 11, 9);
  const now = () => clock;
  const fixture = createLocalCoinSwapFixtureFetch({ now });
  let sends = 0;
  const call = start(t, {
    now,
    fetcher(input, init) {
      if (init.method === 'POST' && ++sends === 1)
        return Promise.resolve(
          Response.json({ detail: 'Throttled.' }, { status: 429, headers: { 'Retry-After': '2' } })
        );
      return fixture(input, init);
    }
  });
  const key = randomUUID();
  const content = { content: 'This delivery can be retried after backoff.' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const limited = await post(call, buyerMessages, content, key);
    assert.equal(error(limited, 429, 'rate_limited').retryAfterSeconds, 2);
    assert.equal(limited.headers['retry-after'], '2');
  }
  assert.equal(result(await call(`/operations/${key}`)).status, 'rejected');
  assert.equal(sends, 1);
  clock += 2_000;
  assert.equal(result(await post(call, buyerMessages, content), 201).content, content.content);
  assert.equal(sends, 2);
});

test('account mutation receipts persist across restarts and are scoped to the upstream account', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'groot-lcs-gateway-'));
  const journalPath = join(directory, 'operations.sqlite');
  const fixture = createLocalCoinSwapFixtureFetch();
  let sends = 0;
  const options = {
    mode: 'account',
    writeEnabled: true,
    journalPath,
    fetcher(input, init) {
      if (init.method === 'POST') sends++;
      return fixture(input, init);
    }
  };
  const gateways = [];
  try {
    const initial = start(t, options);
    gateways.push(initial);
    const key = randomUUID();
    const content = { content: 'Store the operation result.' };
    const message = result(await post(initial, buyerMessages, content, key), 201);
    initial.close();
    const restarted = start(t, options);
    gateways.push(restarted);
    assert.equal(result(await restarted(`/operations/${key}`)).status, 'succeeded');
    assert.deepEqual(result(await post(restarted, buyerMessages, content, key), 201), message);
    const readOnly = start(t, { ...options, writeEnabled: false });
    gateways.push(readOnly);
    assert.equal(result(await readOnly('/capabilities')).tradeActions, false);
    assert.equal(result(await readOnly(`/operations/${key}`)).status, 'succeeded');
    error(await post(readOnly, buyerMessages, content, key), 403, 'writes_disabled');
    const anotherAccount = start(t, { ...options, accountScope: 'b'.repeat(64) });
    gateways.push(anotherAccount);
    error(await anotherAccount(`/operations/${key}`), 404, 'not_found');
    error(await post(anotherAccount, buyerMessages, content, key), 409, 'conflict');
    assert.equal(sends, 1);
  } finally {
    for (const call of gateways) call.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
