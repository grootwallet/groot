import { describe, expect, it } from 'vitest';
import {
  buildLocalCoinSwapOfferUrl,
  buildLocalCoinSwapOffersUrl,
  LocalCoinSwapPublicResponseError,
  normalizeLocalCoinSwapOffers
} from '../../../packages/marketplace/localcoinswap';

const now = 1_799_999_000_000;
const id = '12a45678-1234-4234-8234-123456789abc';
const offer = {
  uuid: id,
  slug: 'buy-btc-for-eur-fixture',
  coin_currency: { symbol: 'BTC', slug: 'BTC', is_crypto: true, token_standard: null },
  fiat_currency: { symbol: 'EUR', is_crypto: false, token_standard: null },
  trading_type: { slug: 'sell' },
  payment_method: { name: 'SEPA Instant', slug: 'sepa-instant' },
  min_trade_size: '50.0000000000',
  max_trade_size: '1000.0000000000',
  price_formula_value: '74934.91572087927',
  current_margin_percentage: '10.0000000000',
  minimum_feedback: '0',
  sms_required: false,
  enforced_sizes: '',
  automatic_cancel_time: '240',
  headline: 'Fixture headline is not trade terms',
  created_by: {
    username: 'fixture-trader',
    user_uuid: '23a45678-1234-4234-9234-123456789abc',
    activity_status: 'active',
    last_seen: now / 1_000 - 30,
    completed_trades: 27,
    feedback_score: '5.00000'
  }
};

function normalize(changes: Record<string, unknown> = {}) {
  return normalizeLocalCoinSwapOffers(
    { count: 1, results: [{ ...offer, ...changes }] },
    'buy',
    now
  );
}

describe('LocalCoinSwap public advertisements', () => {
  it('preserves an exact sub-cent price while limiting cents to presentation', () => {
    expect(normalize()[0]).toMatchObject({
      provider: 'localcoinswap',
      indicative: true,
      id,
      intent: 'buy',
      currency: 'EUR',
      paymentMethod: 'sepa_instant',
      pricePerBtcCents: 7_493_492,
      exactPricePerBtc: { units: '7493491572087927', scale: 11 },
      minFiatCents: 5_000,
      maxFiatCents: 100_000,
      counterparty: { id: offer.created_by.user_uuid, alias: 'fixture-trader', completedTrades: 27 }
    });
    expect(normalize()[0]).not.toHaveProperty('version');
    expect(normalize()[0]).not.toHaveProperty('netSats');
  });

  it('keeps stars, cancellation deadlines and headlines out of unsupported economic claims', () => {
    expect(normalize()[0]).toMatchObject({
      paymentWindowMinutes: null,
      confirmations: null,
      terms: null,
      firstTradeLimitCents: null,
      requiresExperiencedUser: null,
      counterparty: {
        ratingBasisPoints: null,
        averagePaymentMinutes: null,
        averageReleaseMinutes: null
      }
    });
  });

  it('preserves visible account restrictions without establishing account eligibility', () => {
    expect(normalize({ sms_required: true, minimum_feedback: '100' })[0]).toMatchObject({
      requiresPhoneVerification: true,
      minimumFeedbackPercent: 100,
      requiresExperiencedUser: null
    });
    expect(normalize({ sms_required: undefined, minimum_feedback: undefined })[0]).toMatchObject({
      requiresPhoneVerification: null,
      minimumFeedbackPercent: null
    });
  });

  it('uses provider buy advertisements when Groot sells', () => {
    expect(
      normalizeLocalCoinSwapOffers(
        { count: 1, results: [{ ...offer, trading_type: { slug: 'buy' } }] },
        'sell',
        now
      )[0].intent
    ).toBe('sell');
    expect(normalize({ trading_type: { slug: 'buy' } })).toEqual([]);
  });

  it.each([
    { coin_currency: { symbol: 'WBTC', slug: 'BTC', is_crypto: true, token_standard: 'ERC20' } },
    { coin_currency: { symbol: 'BTC', slug: 'BTC', is_crypto: true, token_standard: 'ERC20' } },
    { coin_currency: { symbol: 'BTC', slug: 'BTC', is_crypto: false, token_standard: null } },
    { coin_currency: { symbol: 'BTC', slug: 'BTC', is_crypto: true } },
    { coin_currency: { symbol: 'BTC', is_crypto: true, token_standard: null } },
    { coin_currency: { symbol: 'BTC', slug: 'BTC-LN', is_crypto: true, token_standard: null } },
    { fiat_currency: { symbol: 'USD', is_crypto: false, token_standard: null } },
    { payment_method: { slug: 'sepa-transfer' } },
    { payment_method: { name: 'SEPA Instant', slug: 'bank-transfers' } },
    { enforced_sizes: '50,100' },
    { enforced_sizes: undefined },
    { hidden: true },
    { hidden: 'false' },
    { sms_required: 'false' },
    { minimum_feedback: '101' },
    { minimum_feedback: '-1' }
  ])('excludes unsupported, ambiguous or unrecognized advertisements: %j', (changes) => {
    expect(normalize(changes)).toEqual([]);
  });

  it.each([
    '1e5',
    '-1',
    '+1',
    '01',
    '.5',
    '1.',
    ' 1',
    '1 ',
    '0',
    'Infinity',
    '1.1234567890123456789',
    '90071992547409999999999999999999999999'
  ])('rejects malformed, unbounded or nonpositive prices: %s', (price) => {
    expect(normalize({ price_formula_value: price })).toEqual([]);
  });

  it('canonicalizes exact decimal price zeroes and rounds display cents without float coercion', () => {
    expect(normalize({ price_formula_value: '10000.005000000000' })[0]).toMatchObject({
      pricePerBtcCents: 1_000_001,
      exactPricePerBtc: { units: '10000005', scale: 3 }
    });
    expect(normalize({ price_formula_value: '10000' })[0].exactPricePerBtc).toEqual({
      units: '10000',
      scale: 0
    });
  });

  it.each([
    { min_trade_size: '50.0010000000' },
    { min_trade_size: '0' },
    { min_trade_size: '1001' },
    { max_trade_size: null },
    { max_trade_size: '50000000000000000.0000000000' },
    { min_trade_size: 50 },
    { price_formula_value: 74934.91 }
  ])('fails closed on unsafe fiat bounds or number coercion: %j', (changes) => {
    expect(normalize(changes)).toEqual([]);
  });

  it.each([
    { activity_status: 'inactive' },
    { activity_status: undefined },
    { last_seen: now / 1_000 + 1 },
    { last_seen: now / 1_000 - 1_801 },
    { last_seen: '1799999000' },
    { user_uuid: '../escape' },
    { username: 'spoof\u202ename' },
    { username: ' trader' },
    { completed_trades: -1 }
  ])('rejects stale or unsafe counterparty data: %j', (changes) => {
    expect(normalize({ created_by: { ...offer.created_by, ...changes } })).toEqual([]);
  });

  it('accepts the exact activity-age boundary and preserves absent trade counts as unknown', () => {
    expect(
      normalize({ created_by: { ...offer.created_by, last_seen: now / 1_000 - 1_800 } })
    ).toHaveLength(1);
    expect(
      normalize({ created_by: { ...offer.created_by, completed_trades: null } })[0].counterparty
        .completedTrades
    ).toBeNull();
  });

  it('discards duplicate offer identities instead of selecting an arbitrary version', () => {
    expect(
      normalizeLocalCoinSwapOffers(
        { count: 2, results: [offer, { ...offer, price_formula_value: '100000' }] },
        'buy',
        now
      )
    ).toEqual([]);
  });

  it('never follows or returns the provider pagination URL', () => {
    const result = normalizeLocalCoinSwapOffers(
      { count: 299, next: 'http://untrusted.example/next', results: [offer] },
      'buy',
      now
    );
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('next');
  });

  it.each([
    null,
    [],
    {},
    { count: 0, results: [offer] },
    { count: -1, results: [] },
    { count: 1, results: {} },
    { count: 1, results: [offer], limit: 101 },
    { count: 1, results: [offer], offset: -1 },
    { count: 101, results: Array.from({ length: 101 }, () => offer) }
  ])('rejects invalid or unbounded response envelopes: %j', (payload) => {
    expect(() => normalizeLocalCoinSwapOffers(payload, 'buy', now)).toThrow(
      LocalCoinSwapPublicResponseError
    );
  });

  it('uses only validated public source URLs without referral or acceptance parameters', () => {
    expect(normalize()[0].url).toBe(
      `https://localcoinswap.com/trade/buy-btc-for-eur-fixture/${id}`
    );
    for (const slug of ['../accept', 'offer?ref=anything', '//other.example', ''])
      expect(() => buildLocalCoinSwapOfferUrl(id, slug)).toThrow(RangeError);
    expect(() => buildLocalCoinSwapOfferUrl('../escape', 'valid-slug')).toThrow(RangeError);
  });

  it('builds a fixed public search with no fiat amount or account context', () => {
    const url = new URL(buildLocalCoinSwapOffersUrl('buy', { limit: 5, offset: 0 }));
    expect(url.origin).toBe('https://api.localcoinswap.com');
    expect(url.pathname).toBe('/api/v2/offers/search/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      coin_currency: 'BTC',
      fiat_currency: 'EUR',
      trading_type: 'sell',
      payment_method: 'sepa-instant',
      last_seen: '30mins',
      limit: '5',
      offset: '0'
    });
    expect(new URL(buildLocalCoinSwapOffersUrl('sell')).searchParams.get('trading_type')).toBe(
      'buy'
    );
    expect(() => buildLocalCoinSwapOffersUrl('buy', { limit: 101 })).toThrow(RangeError);
    expect(() => buildLocalCoinSwapOffersUrl('buy', { offset: -1 })).toThrow(RangeError);
  });
});
