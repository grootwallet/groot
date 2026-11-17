// @ts-check

const ORIGIN = 'https://api.localcoinswap.com';
const API = '/api/v2';

export const LOCALCOINSWAP_FIXTURE_KEY = 'lcs_12345678_0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
export const LOCALCOINSWAP_FIXTURE_TRADES = Object.freeze({
  buy: '91e1dc0f-1fc8-4232-9d7b-0f3aee06b001',
  sell: '91e1dc0f-1fc8-4232-9d7b-0f3aee06b002',
  past: '91e1dc0f-1fc8-4232-9d7b-0f3aee06b003',
  requested: '91e1dc0f-1fc8-4232-9d7b-0f3aee06b004'
});
export const LOCALCOINSWAP_FIXTURE_OFFERS = Object.freeze({
  buy: '91e1dc0f-1fc8-4232-9d7b-0f3aee06b011',
  sell: '91e1dc0f-1fc8-4232-9d7b-0f3aee06b012'
});

const BTC = { symbol: 'BTC', title: 'Bitcoin', slug: 'BTC', is_crypto: true, token_standard: null };
const EUR = { symbol: 'EUR', title: 'Euro', slug: 'EUR', is_crypto: false, token_standard: null };
const PAYMENT = { name: 'SEPA Instant', slug: 'sepa-instant' };

/** @typedef {'CREATED'|'CRYPTO_ESC'|'FUND_PAID'|'COMPLETED'|'CANCELLED'|'DISPUTED'} TradeStatus */

/** @param {number} status @param {string} code @param {string} message */
function problem(status, code, message) {
  return Response.json({ error: true, code, message, detail: message }, { status });
}

/** @param {string} field */
function invalid(field, message = 'Invalid value.') {
  return Response.json({ error: true, [field]: [{ code: 'invalid', message }] }, { status: 400 });
}

function missing() {
  return problem(404, 'not_found', 'Not found.');
}

function conflict() {
  return problem(
    409,
    'invalid_transition',
    'This action is unavailable in the current trade status.'
  );
}

/** @param {URL} url @param {readonly unknown[]} rows */
function page(url, rows, maximum = 100) {
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) return invalid('limit');
  if (!Number.isSafeInteger(offset) || offset < 0) return invalid('offset');
  /** @param {number} nextOffset */
  function link(nextOffset) {
    const target = new URL(url);
    target.searchParams.set('limit', String(limit));
    target.searchParams.set('offset', String(nextOffset));
    return target.href;
  }
  return Response.json({
    count: rows.length,
    next: offset + limit < rows.length ? link(offset + limit) : null,
    previous: offset > 0 ? link(Math.max(offset - limit, 0)) : null,
    limit,
    offset,
    results: rows.slice(offset, offset + limit)
  });
}

/** @param {string} username @param {string} userUuid @param {number} seconds */
function party(username, userUuid, seconds) {
  return {
    username,
    user_uuid: userUuid,
    activity_status: 'active',
    activity_tooltip: null,
    last_seen: seconds,
    is_legacy: false,
    completed_trades: 42,
    is_phone_verified: true,
    is_email_verified: true,
    platform_volume: null
  };
}

/**
 * @param {string} id @param {'buy'|'sell'} side
 * @param {ReturnType<typeof party>} owner @param {string} price
 */
function offer(id, side, owner, price) {
  return {
    uuid: id,
    slug: `${side}-bitcoin-eur-sepa-instant-fr`,
    is_active: true,
    created_by: owner,
    trading_type: { slug: side, name: side === 'sell' ? 'Sell' : 'Buy' },
    coin_currency: BTC,
    fiat_currency: EUR,
    payment_method: PAYMENT,
    location_name: 'France',
    country_code: 'FR',
    min_trade_size: '50.0000000000',
    max_trade_size: '250.0000000000',
    headline: null,
    hidden: false,
    sms_required: false,
    minimum_feedback: '0',
    enforced_sizes: '',
    price_formula_value: price,
    trading_conditions: 'Send from a bank account in your name.'
  };
}

/**
 * @param {number} id @param {string} uuid @param {ReturnType<typeof offer>} ad
 * @param {ReturnType<typeof party>} buyer @param {ReturnType<typeof party>} seller
 * @param {TradeStatus} status @param {number} createdAt @param {number|null} expiryAt
 */
function trade(id, uuid, ad, buyer, seller, status, createdAt, expiryAt) {
  const sellTrade = ad.trading_type.slug === 'buy';
  return {
    id,
    uuid,
    status,
    ad,
    offer: ad,
    status_meta: {},
    buyer,
    seller,
    contract_responder: ad.trading_type.slug === 'sell' ? buyer : seller,
    disputed_by: /** @type {Pick<ReturnType<typeof party>,'username'|'user_uuid'>|null} */ (null),
    fiat_amount: '100.0000000000',
    coin_amount: sellTrade ? '0.00125786' : '0.00125000',
    coin_currency: BTC,
    fiat_currency: EUR,
    time_created: createdAt,
    time_of_expiry: expiryAt,
    non_custodial: true,
    amount_to_escrow: sellTrade ? '0.00127044' : '0.00126250',
    fees: sellTrade ? '0.00001258' : '0.00001250',
    btc_escrow_data: {
      escrow_address: 'fixture-escrow-address',
      fee_address: 'fixture-fee-address',
      escrow_tx: '7'.repeat(64)
    },
    eth_escrow_data: null,
    multisig_escrow_data: null,
    responder_geo: null,
    buyer_meta: { buyer_encrypted_secret: 'fixture-buyer-secret' },
    seller_meta: { seller_encrypted_secret: 'fixture-seller-secret' },
    tx_meta: { escrow_unsigned_tx: true, escrow_witness: 'fixture-witness' }
  };
}

/**
 * @param {number} id @param {ReturnType<typeof party>} author
 * @param {string} content @param {number} seconds
 */
function chatMessage(id, author, content, seconds) {
  return {
    id,
    content,
    message: content,
    created_by: author,
    time_created: seconds,
    recipient: null,
    attachment: null,
    file: null
  };
}

/** @param {string|null} query @param {string} value */
function matches(query, value) {
  return query === null || query.split(',').includes(value);
}

/** @param {Request} request @returns {Promise<Record<string, unknown>|null>} */
async function jsonObject(request) {
  try {
    /** @type {unknown} */
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? /** @type {Record<string,unknown>} */ (value)
      : null;
  } catch {
    return null;
  }
}

/**
 * In-process fixture of the documented provider wire contract. Never makes a network request.
 * @param {{now?:()=>number}} [options]
 * @returns {typeof fetch}
 */
export function createLocalCoinSwapFixtureFetch({ now = Date.now } = {}) {
  const seconds = () => Math.floor(now() / 1_000);
  const createdAt = seconds() - 120;
  const expiryAt = createdAt + 3_600;
  const account = party('groot-tester', '91e1dc0f-1fc8-4232-9d7b-0f3aee06b021', createdAt);
  const frenchSeller = party('Camille', '91e1dc0f-1fc8-4232-9d7b-0f3aee06b022', createdAt);
  const frenchBuyer = party('Jules', '91e1dc0f-1fc8-4232-9d7b-0f3aee06b023', createdAt);
  const buyOffer = offer(LOCALCOINSWAP_FIXTURE_OFFERS.buy, 'sell', frenchSeller, '80000.00');
  const sellOffer = offer(LOCALCOINSWAP_FIXTURE_OFFERS.sell, 'buy', frenchBuyer, '79500.00');
  const offers = new Map([
    [buyOffer.uuid, buyOffer],
    [sellOffer.uuid, sellOffer]
  ]);
  /** @type {Map<string,ReturnType<typeof trade>>} */
  const trades = new Map([
    [
      LOCALCOINSWAP_FIXTURE_TRADES.buy,
      trade(
        1,
        LOCALCOINSWAP_FIXTURE_TRADES.buy,
        buyOffer,
        account,
        frenchSeller,
        'CRYPTO_ESC',
        createdAt,
        expiryAt
      )
    ],
    [
      LOCALCOINSWAP_FIXTURE_TRADES.sell,
      trade(
        2,
        LOCALCOINSWAP_FIXTURE_TRADES.sell,
        sellOffer,
        frenchBuyer,
        account,
        'FUND_PAID',
        createdAt - 60,
        expiryAt
      )
    ],
    [
      LOCALCOINSWAP_FIXTURE_TRADES.past,
      trade(
        3,
        LOCALCOINSWAP_FIXTURE_TRADES.past,
        buyOffer,
        account,
        frenchSeller,
        'COMPLETED',
        createdAt - 300,
        null
      )
    ],
    [
      LOCALCOINSWAP_FIXTURE_TRADES.requested,
      trade(
        4,
        LOCALCOINSWAP_FIXTURE_TRADES.requested,
        buyOffer,
        account,
        frenchSeller,
        'CREATED',
        createdAt - 120,
        expiryAt
      )
    ]
  ]);
  let nextMessageId = 4;
  /** @type {Map<string,ReturnType<typeof chatMessage>[]>} */
  const messages = new Map([
    [
      LOCALCOINSWAP_FIXTURE_TRADES.buy,
      [
        chatMessage(1, frenchSeller, 'The bitcoin is in escrow.', createdAt),
        chatMessage(2, account, 'Thanks. I’ll check the payment instructions.', createdAt + 1)
      ]
    ],
    [
      LOCALCOINSWAP_FIXTURE_TRADES.sell,
      [chatMessage(3, frenchBuyer, 'I sent the bank transfer.', createdAt + 2)]
    ]
  ]);
  /** @type {Map<string,TradeStatus>} */
  const disputeStatus = new Map();
  const transactions = [
    {
      id: 51,
      tx: '7'.repeat(64),
      txtype: 'ESCROW_RELEASE',
      value: 125_000,
      is_confirmed: true,
      first_seen_at: createdAt,
      confirmed_at: createdAt + 60,
      ref_data: { address: 'fixture-transaction-address', secret: 'fixture-transaction-secret' }
    },
    {
      id: 50,
      tx: null,
      txtype: 'WITHDRAW',
      value: -50_000,
      is_confirmed: false,
      first_seen_at: createdAt - 60,
      confirmed_at: null,
      ref_data: {}
    },
    {
      id: 49,
      tx: '8'.repeat(64),
      txtype: 'DEPOSIT',
      value: 200_000,
      is_confirmed: true,
      first_seen_at: createdAt - 600,
      confirmed_at: createdAt - 60,
      ref_data: {}
    }
  ];

  return async function fixtureFetch(input, init) {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    const url = new URL(request.url);
    if (url.origin !== ORIGIN || !url.pathname.startsWith(`${API}/`)) return missing();
    const { method } = request;
    const path = url.pathname.slice(API.length).split('/').filter(Boolean);
    const [group, resource, action, id] = path;
    if (group === 'offers' && method === 'GET' && path.length === 2) {
      const seen = seconds();
      /** @param {ReturnType<typeof offer>} row */
      const recent = (row) => ({ ...row, created_by: { ...row.created_by, last_seen: seen } });
      if (resource === 'search') {
        const query = url.searchParams;
        const rows = [...offers.values()].filter(
          (row) =>
            matches(query.get('coin_currency'), row.coin_currency.symbol) &&
            matches(query.get('fiat_currency'), row.fiat_currency.symbol) &&
            matches(query.get('payment_method'), row.payment_method.slug) &&
            matches(query.get('trading_type'), row.trading_type.slug) &&
            matches(query.get('country_code_exact'), row.country_code)
        );
        return page(url, rows.map(recent));
      }
      const found = offers.get(resource);
      return found ? Response.json(recent(found)) : missing();
    }

    if (group !== 'trades' && group !== 'tx-history') return missing();
    if (request.headers.get('authorization') !== `ApiKey ${LOCALCOINSWAP_FIXTURE_KEY}`) {
      return Response.json(
        { error: true, code: 'not_authenticated', message: 'The fixture API key is invalid.' },
        { status: 401, headers: { 'WWW-Authenticate': 'ApiKey' } }
      );
    }

    if (group === 'tx-history') {
      if (method !== 'GET' || resource !== 'non-custodial' || action !== 'BTC' || id)
        return missing();
      const type = url.searchParams.get('txtype');
      return page(
        url,
        transactions.filter((row) => type === null || row.txtype === type)
      );
    }

    if (resource === 'list' && method === 'GET' && path.length === 2) {
      const stage = url.searchParams.get('stage');
      if (stage !== null && stage !== 'live' && stage !== 'past') return invalid('stage');
      const rows = [...trades.values()].filter((row) => {
        const finished = row.status === 'COMPLETED' || row.status === 'CANCELLED';
        if (stage === 'live') return !finished;
        if (stage === 'past') return finished;
        return true;
      });
      return page(
        url,
        rows.map(
          ({
            uuid,
            status,
            offer,
            buyer,
            seller,
            fiat_amount,
            coin_amount,
            coin_currency,
            fiat_currency,
            time_created
          }) => ({
            uuid,
            status,
            offer,
            buyer,
            seller,
            fiat_amount,
            coin_amount,
            coin_currency,
            fiat_currency,
            time_created
          })
        )
      );
    }

    const tradeId =
      resource === 'message' && action === 'list'
        ? id
        : resource === 'non-custodial' && action === 'update'
          ? id
          : ['message', 'dispute', 'withdraw-dispute'].includes(resource)
            ? action
            : resource;
    const found = trades.get(tradeId);
    if (!found) return missing();
    if (method === 'GET' && resource === tradeId && path.length === 2) return Response.json(found);
    if (method === 'GET' && resource === tradeId && action === 'status' && path.length === 3) {
      return Response.json({ uuid: found.uuid, status: found.status });
    }
    if (method === 'GET' && resource === 'message' && action === 'list' && path.length === 4) {
      return page(url, messages.get(tradeId) ?? [], 1_000);
    }
    if (method === 'POST' && resource === 'message' && path.length === 3) {
      const body = await jsonObject(request);
      if (
        typeof body?.content !== 'string' ||
        !body.content.trim() ||
        [...body.content].length > 1_000
      )
        return invalid('content');
      const message = chatMessage(nextMessageId++, account, body.content, seconds());
      messages.set(tradeId, [...(messages.get(tradeId) ?? []), message]);
      return Response.json(message, { status: 201 });
    }
    if (
      method === 'PATCH' &&
      resource === 'non-custodial' &&
      action === 'update' &&
      path.length === 4
    ) {
      const body = await jsonObject(request);
      if (body?.status === 'CANCELLED') {
        if (found.status !== 'CREATED') return conflict();
        found.status = 'CANCELLED';
        return Response.json(found);
      }
      if (body?.status !== 'FUND_PAID') return invalid('status');
      if (found.buyer.user_uuid !== account.user_uuid || found.status !== 'CRYPTO_ESC')
        return conflict();
      found.status = 'FUND_PAID';
      return Response.json(found);
    }
    if (method === 'POST' && resource === 'dispute' && path.length === 3) {
      const body = await jsonObject(request);
      if (typeof body?.description !== 'string' || !body.description.trim())
        return invalid('description');
      if (found.status !== 'CRYPTO_ESC' && found.status !== 'FUND_PAID') return conflict();
      disputeStatus.set(tradeId, found.status);
      found.status = 'DISPUTED';
      found.disputed_by = { username: account.username, user_uuid: account.user_uuid };
      return Response.json({ message: 'Dispute opened.' });
    }
    if (method === 'POST' && resource === 'withdraw-dispute' && path.length === 3) {
      const prior = disputeStatus.get(tradeId);
      if (found.status !== 'DISPUTED' || !prior) return conflict();
      found.status = prior;
      found.disputed_by = null;
      disputeStatus.delete(tradeId);
      return Response.json({ uuid: found.uuid, status: found.status });
    }
    return missing();
  };
}
