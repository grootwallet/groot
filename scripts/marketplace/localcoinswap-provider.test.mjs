// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLocalCoinSwapProvider,
  LocalCoinSwapError
} from '../../packages/marketplace/localcoinswap-provider.mjs';

const offerId = 'd2530407-840f-44ea-bafa-e6e89b091a55';
const tradeId = 'f1a44b32-5032-45f9-8c2f-3d4194ba5418';
const otherTradeId = '9db21683-ec9c-4de5-a52f-08d2593dab4c';
const apiKey = 'lcs_fixture_dummy_secret';
const time = 1_793_830_445_000;
const maker = { username: 'example-maker' };
const payment = { slug: 'sepa-instant' };
const offer = {
  uuid: offerId,
  country_code: 'FR',
  created_by: maker,
  trading_type: { slug: 'sell' },
  coin_currency: { symbol: 'BTC', slug: 'BTC', token_standard: null },
  fiat_currency: { symbol: 'EUR', slug: 'euro', token_standard: null },
  payment_method: payment,
  min_trade_size: '50.0000000000',
  max_trade_size: '300.0000000000',
  price_formula_value: '76308.28790587235'
};
const trade = {
  uuid: tradeId,
  status: 'CRYPTO_ESC',
  buyer: { username: 'example-buyer' },
  seller: maker,
  fiat_amount: '120.000000000000000000',
  coin_amount: '0.001500000000000000',
  coin_currency: { symbol: 'BTC' },
  fiat_currency: { symbol: 'EUR' },
  ad: { payment_method: payment },
  time_created: time / 1000,
  time_of_expiry: null,
  non_custodial: true,
  tx_meta: { seller_secret: 'synthetic-private-material' }
};
const message = {
  id: 42,
  created_by: maker,
  content: 'Payment sent.',
  attachment: { url: '', attachment_name: '' },
  file: null,
  time_created: time / 1000
};
const transaction = {
  id: 50,
  tx: 'AB'.repeat(32),
  txtype: 'WITHDRAW',
  value: -50_000,
  is_confirmed: true,
  first_seen_at: time / 1000,
  confirmed_at: time / 1000 + 60,
  ref_data: { address: 'synthetic-private-address', secret: 'synthetic-private-reference' }
};

/** @param {unknown} value @param {number} [status] */
function json(value, status = 200) {
  return Response.json(value, { status });
}

/** @param {Response[]} replies */
function fixture(replies) {
  /** @type {{url:URL, init:RequestInit|undefined}[]} */
  const calls = [];
  let nowMs = time;
  const provider = createLocalCoinSwapProvider({
    apiKey,
    now: () => nowMs,
    fetcher: async (url, init) => {
      assert.ok(url instanceof URL);
      const response = replies.shift();
      assert.ok(response, 'unexpected upstream call');
      calls.push({ url, init });
      return response;
    }
  });
  return {
    calls,
    provider,
    /** @param {number} milliseconds */
    advance(milliseconds) {
      nowMs += milliseconds;
    }
  };
}

/** @param {string} code */
function isError(code) {
  return (/** @type {unknown} */ error) =>
    error instanceof LocalCoinSwapError && error.code === code && error.message === code;
}

test('public offer search sends only fixed filters, flips maker side and preserves exact decimal price', async () => {
  const { provider, calls } = fixture([
    json({
      count: 10,
      limit: 3,
      offset: 1,
      next: 'https://evil.invalid/path',
      results: [
        offer,
        { ...offer, country_code: 'DE' },
        { ...offer, max_trade_size: '99999999999999999.99' }
      ]
    })
  ]);
  const result = await provider.searchOffers({ intent: 'buy', country: 'FR', limit: 3, offset: 1 });
  assert.deepEqual(result, {
    total: 10,
    nextOffset: 4,
    items: [
      {
        id: offerId,
        intent: 'buy',
        country: 'FR',
        currency: 'EUR',
        paymentMethod: 'sepa_instant',
        pricePerBtcCents: 7630829,
        exactPricePerBtc: { units: '7630828790587235', scale: 11 },
        minFiatCents: 5000,
        maxFiatCents: 30000,
        maker: maker.username,
        terms: null,
        active: true,
        observedAtMs: time
      }
    ]
  });
  assert.equal(calls[0].url.origin, 'https://api.localcoinswap.com');
  assert.equal(calls[0].url.pathname, '/api/v2/offers/search/');
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), {
    coin_currency: 'BTC',
    fiat_currency: 'EUR',
    trading_type: 'sell',
    payment_method: 'sepa-instant',
    last_seen: '30mins',
    limit: '3',
    offset: '1',
    country_code_exact: 'FR'
  });
  assert.equal(new Headers(calls[0].init?.headers).get('Authorization'), null);
  assert.equal(calls[0].init?.redirect, 'error');
});

test('public offer detail binds UUID, preserves plain terms, and reports inactive and fixed-amount offers', async () => {
  const { provider, calls } = fixture([
    json({ ...offer, is_active: true, trading_conditions: 'First line\r\nSecond line' }),
    json({ ...offer, is_active: true, enforced_sizes: '50,100' }),
    json({ ...offer, is_active: true, uuid: otherTradeId })
  ]);
  assert.equal((await provider.getOffer(offerId)).terms, 'First line\nSecond line');
  assert.equal((await provider.getOffer(offerId)).active, false);
  await assert.rejects(provider.getOffer(offerId), isError('invalid_response'));
  assert.equal(calls[0].url.pathname, `/api/v2/offers/${offerId}/`);
  assert.equal(new Headers(calls[0].init?.headers).has('Authorization'), false);
});

test('authenticated trade reads and messages project known fields and omit secrets and attachments', async () => {
  const { provider, calls } = fixture([
    json({ count: 1, results: [{ ...trade, offer: trade.ad, ad: undefined }] }),
    json(trade),
    json({
      count: 2,
      results: [
        message,
        {
          ...message,
          id: 43,
          content: null,
          attachment: { url: 'https://untrusted.invalid/proof' }
        }
      ]
    })
  ]);
  const expected = {
    id: tradeId,
    status: 'CRYPTO_ESC',
    buyer: 'example-buyer',
    seller: 'example-maker',
    fiatCents: 12000,
    bitcoinSats: 150000,
    createdAtMs: time,
    expiresAtMs: null
  };
  assert.deepEqual(await provider.listTrades({ stage: 'live' }), {
    items: [expected],
    total: 1,
    nextOffset: null
  });
  assert.deepEqual(await provider.getTrade(tradeId), expected);
  assert.deepEqual(await provider.listMessages(tradeId), {
    items: [
      {
        id: 42,
        sender: maker.username,
        content: message.content,
        createdAtMs: time,
        hasAttachment: false
      },
      { id: 43, sender: maker.username, content: null, createdAtMs: time, hasAttachment: true }
    ],
    total: 2,
    nextOffset: null
  });
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), {
    stage: 'live',
    trade_format: 'non-custodial',
    coin_currency: 'BTC',
    fiat_currency: 'EUR',
    payment_method: 'sepa-instant',
    limit: '20',
    offset: '0'
  });
  assert.equal(calls[2].url.pathname, `/api/v2/trades/message/list/${tradeId}/`);
  for (const { init } of calls)
    assert.equal(new Headers(init?.headers).get('Authorization'), `ApiKey ${apiKey}`);
});

test('authenticated transaction history preserves signed and missing fields and strips references', async () => {
  const { provider, calls } = fixture([
    json({ count: 3, offset: 1, limit: 1, results: [transaction] }),
    json({ count: 1, results: [{ id: 51, txtype: 'ESCROW_REFUND', tx: null, value: null }] })
  ]);
  assert.deepEqual(await provider.listTransactions({ type: 'WITHDRAW', limit: 1, offset: 1 }), {
    items: [
      {
        id: 50,
        txid: 'ab'.repeat(32),
        type: 'WITHDRAW',
        sats: -50_000,
        confirmed: true,
        firstSeenAtMs: time,
        confirmedAtMs: time + 60_000
      }
    ],
    nextOffset: 2,
    total: 3
  });
  assert.deepEqual(await provider.listTransactions(), {
    items: [
      {
        id: 51,
        txid: null,
        type: 'ESCROW_REFUND',
        sats: null,
        confirmed: null,
        firstSeenAtMs: null,
        confirmedAtMs: null
      }
    ],
    nextOffset: null,
    total: 1
  });
  assert.equal(calls[0].url.origin, 'https://api.localcoinswap.com');
  assert.equal(calls[0].url.pathname, '/api/v2/tx-history/non-custodial/BTC/');
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), {
    limit: '1',
    offset: '1',
    txtype: 'WITHDRAW'
  });
  assert.deepEqual(Object.fromEntries(calls[1].url.searchParams), { limit: '20', offset: '0' });
  for (const { init } of calls) {
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'), `ApiKey ${apiKey}`);
  }
});

test('transaction history rejects malformed rows, duplicate IDs and a mismatched type filter', async () => {
  const malformed = [
    { id: 0 },
    { tx: 'a'.repeat(63) },
    { tx: 'z'.repeat(64) },
    { txtype: 'INTERNAL' },
    { value: -2_100_000_000_000_001 },
    { value: 2_100_000_000_000_001 },
    { value: 0.5 },
    { value: '10' },
    { is_confirmed: 'true' },
    { confirmed_at: -1 }
  ];
  const { provider, calls } = fixture([
    ...malformed.map((row) => json({ count: 1, results: [{ ...transaction, ...row }] })),
    json({ count: 2, results: [transaction, transaction] }),
    json({ count: 1, results: [transaction] }),
    json({ count: 1, offset: 1, results: [transaction] })
  ]);
  for (const _ of malformed) {
    await assert.rejects(provider.listTransactions(), isError('invalid_response'));
  }
  await assert.rejects(provider.listTransactions(), isError('invalid_response'));
  await assert.rejects(provider.listTransactions({ type: 'DEPOSIT' }), isError('invalid_response'));
  await assert.rejects(provider.listTransactions({ offset: 1 }), isError('invalid_response'));
  assert.throws(() => provider.listTransactions({ type: 'unknown' }), isError('invalid_request'));
  assert.equal(calls.length, malformed.length + 3);
});

test('latest chat is bounded and includes messages appended between oldest-first pages', async () => {
  const { provider, calls } = fixture([
    json({ count: 1, offset: 0, results: [message] }),
    json({ count: 5, offset: 0, results: [message, { ...message, id: 43 }] }),
    json({
      count: 6,
      offset: 3,
      results: [45, 46, 47].map((id) => ({ ...message, id }))
    })
  ]);
  const short = await provider.listLatestMessages(tradeId, { limit: 2 });
  assert.deepEqual([short.offset, short.total, short.nextOffset], [0, 1, null]);
  assert.deepEqual(
    short.items.map(({ id }) => id),
    [42]
  );
  const long = await provider.listLatestMessages(tradeId, { limit: 2 });
  assert.deepEqual([long.offset, long.total, long.nextOffset], [4, 6, null]);
  assert.deepEqual(
    long.items.map(({ id }) => id),
    [46, 47]
  );
  assert.deepEqual(
    calls.map(({ url }) => [url.searchParams.get('limit'), url.searchParams.get('offset')]),
    [
      ['2', '0'],
      ['2', '0'],
      ['18', '3']
    ]
  );
});

test('latest chat fails closed for incomplete tails, duplicates and excessive offsets', async () => {
  const { provider, calls } = fixture([
    json({ count: 5, offset: 0, results: [message, { ...message, id: 43 }] }),
    json({ count: 6, offset: 3, results: [message, { ...message, id: 43 }] }),
    json({ count: 2, offset: 0, results: [message, message] }),
    json({ count: 10_003, offset: 0, results: [message, { ...message, id: 43 }] })
  ]);
  await assert.rejects(
    provider.listLatestMessages(tradeId, { limit: 2 }),
    isError('provider_unavailable')
  );
  await assert.rejects(
    provider.listLatestMessages(tradeId, { limit: 2 }),
    isError('invalid_response')
  );
  await assert.rejects(
    provider.listLatestMessages(tradeId, { limit: 2 }),
    isError('invalid_response')
  );
  assert.equal(calls.length, 4);
});

test('supported writes send only documented fields and expected methods', async () => {
  const { provider, calls } = fixture([
    json(message, 201),
    json({ ...trade, status: 'FUND_PAID' }),
    json({ message: 'Dispute opened.' }),
    json({ uuid: tradeId, status: 'FUND_PAID' }),
    json({ ...trade, status: 'CANCELLATION_REQUESTED' })
  ]);
  assert.equal((await provider.sendMessage(tradeId, message.content)).id, 42);
  assert.equal((await provider.markPaid(tradeId)).status, 'FUND_PAID');
  assert.deepEqual(await provider.openDispute(tradeId, 'No deposit received.'), {
    id: tradeId,
    status: 'DISPUTED'
  });
  assert.deepEqual(await provider.withdrawDispute(tradeId), { id: tradeId, status: 'FUND_PAID' });
  assert.equal((await provider.cancelUnfunded(tradeId)).status, 'CANCELLATION_REQUESTED');
  assert.deepEqual(
    calls.map(({ url, init }) => [init?.method, url.pathname, init?.body]),
    [
      ['POST', `/api/v2/trades/message/${tradeId}/`, JSON.stringify({ content: message.content })],
      [
        'PATCH',
        `/api/v2/trades/non-custodial/update/${tradeId}/`,
        JSON.stringify({ status: 'FUND_PAID' })
      ],
      [
        'POST',
        `/api/v2/trades/dispute/${tradeId}/`,
        JSON.stringify({ description: 'No deposit received.' })
      ],
      ['POST', `/api/v2/trades/withdraw-dispute/${tradeId}/`, undefined],
      ['PATCH', `/api/v2/trades/non-custodial/update/${tradeId}/`, '{"status":"CANCELLED"}']
    ]
  );
});

test('invalid input and missing credentials stop before contacting upstream', async () => {
  const { provider, calls } = fixture([]);
  assert.throws(
    () => provider.searchOffers({ intent: 'sell', country: 'fr' }),
    isError('invalid_request')
  );
  assert.throws(() => provider.getTrade('../offers'), isError('invalid_request'));
  assert.throws(() => provider.listMessages(tradeId, { limit: 101 }), isError('invalid_request'));
  assert.throws(() => provider.sendMessage(tradeId, '   '), isError('invalid_request'));
  assert.throws(() => provider.sendMessage(tradeId, 'x'.repeat(1001)), isError('invalid_request'));
  const noKey = createLocalCoinSwapProvider({
    fetcher: async () => {
      throw new Error('unexpected fetch');
    }
  });
  await assert.rejects(noKey.getTrade(tradeId), isError('provider_auth'));
  assert.deepEqual(calls, []);
});

test('rate limit uses bounded Retry-After, suppresses duplicate calls and keeps public/account backoff separate', async () => {
  const { provider, calls, advance } = fixture([
    new Response('provider detail', { status: 429, headers: { 'Retry-After': '7' } }),
    json({ ...offer, is_active: true }),
    json(trade)
  ]);
  await assert.rejects(provider.getTrade(tradeId), { code: 'rate_limited', retryAfterSeconds: 7 });
  advance(2500);
  await assert.rejects(provider.getTrade(tradeId), { code: 'rate_limited', retryAfterSeconds: 5 });
  await provider.getOffer(offerId);
  advance(4500);
  await provider.getTrade(tradeId);
  assert.equal(calls.length, 3);
});

test('HTTP errors are classified without returning arbitrary upstream response bodies', async () => {
  const rows = /** @type {const} */ ([
    [400, 'invalid_request'],
    [401, 'provider_auth'],
    [403, 'provider_forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [503, 'provider_unavailable']
  ]);
  const { provider, calls } = fixture(
    rows.map(([status]) => new Response('sensitive upstream body', { status }))
  );
  for (const [, code] of rows) await assert.rejects(provider.getTrade(tradeId), isError(code));
  assert.equal(calls.length, rows.length);
});

test('transport failure, wrong identity or a malformed success after a write are unknown outcomes', async () => {
  const { provider, calls } = fixture([
    new Response('transient failure', { status: 503 }),
    json({ ...trade, uuid: otherTradeId, status: 'FUND_PAID' }),
    json(trade),
    json({ error: true, message: 'not opened' })
  ]);
  await assert.rejects(provider.markPaid(tradeId), isError('operation_unknown'));
  await assert.rejects(provider.markPaid(tradeId), isError('operation_unknown'));
  await assert.rejects(provider.markPaid(tradeId), isError('operation_unknown'));
  await assert.rejects(provider.openDispute(tradeId, 'A dispute.'), isError('operation_unknown'));
  assert.equal(calls.length, 4);
});

test('bounds response size and rejects non-JSON or inconsistent normalized data', async () => {
  const { provider } = fixture([
    new Response('wrong type', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{"x":"' + 'x'.repeat(1_048_576) + '"}', {
      headers: { 'Content-Type': 'application/json' }
    }),
    json({ ...trade, coin_amount: '0.000000001' }),
    json({ ...trade, status: 'UNRECOGNIZED' }),
    json({ ...trade, ad: { payment_method: { slug: 'cash-deposit' } } })
  ]);
  for (let attempt = 0; attempt < 5; attempt++)
    await assert.rejects(provider.getTrade(tradeId), isError('invalid_response'));
});

test('aborted requests settle even if a transport does not honor cancellation', async () => {
  const abort = new AbortController();
  const provider = createLocalCoinSwapProvider({
    apiKey,
    fetcher: () => new Promise(() => {})
  });
  const pending = provider.getTrade(tradeId, abort.signal);
  abort.abort();
  await assert.rejects(pending, isError('provider_unavailable'));
  await assert.rejects(provider.getTrade(tradeId, abort.signal), isError('provider_unavailable'));
});
