import { describe, expect, it } from 'vitest';
import {
  buildHodlOffersUrl,
  HodlPublicResponseError,
  normalizeHodlOffers
} from '../../../packages/marketplace/hodlhodl';

const now = 1_799_999_000_000;
const offer = {
  id: 'AvalidOffer123',
  version: 'v123',
  asset_code: 'BTC',
  asset_layer: 'BTC',
  currency_code: 'EUR',
  side: 'sell',
  searchable: true,
  working_now: true,
  price: '68979.28',
  min_amount: '125.00',
  max_amount: '10000.00',
  first_trade_limit: null,
  payment_window_minutes: 90,
  confirmations: 1,
  description: null,
  payment_method_instructions: [{ payment_method_id: '9081' }],
  trader: {
    login: 'example-trader',
    rating: '1.00',
    trades_count: 64,
    average_payment_time_minutes: null,
    average_release_time_minutes: 0
  }
};
const normalize = (overrides: Record<string, unknown> = {}) =>
  normalizeHodlOffers(
    {
      status: 'success',
      offers: [{ ...offer, ...overrides }]
    },
    'buy',
    now
  );

describe('Hodl Hodl public offer discovery', () => {
  it('normalizes exact integer cents without inventing an executable net quote', () => {
    const [result] = normalize();
    expect(result).toMatchObject({
      provider: 'hodlhodl',
      indicative: true,
      intent: 'buy',
      currency: 'EUR',
      pricePerBtcCents: 6_897_928,
      minFiatCents: 12_500,
      maxFiatCents: 1_000_000,
      observedAtMs: now,
      requiresExperiencedUser: null,
      counterparty: {
        ratingBasisPoints: 10_000,
        averagePaymentMinutes: null,
        averageReleaseMinutes: 0
      }
    });
    expect(result).not.toHaveProperty('netSats');
    expect(result).not.toHaveProperty('quote');
  });

  it('uses the buy-offer payment_methods shape when Groot sells', () => {
    expect(
      normalizeHodlOffers(
        {
          status: 'success',
          offers: [
            {
              ...offer,
              side: 'buy',
              payment_method_instructions: undefined,
              payment_methods: [{ id: '9081' }]
            }
          ]
        },
        'sell',
        now
      )
    ).toHaveLength(1);
    expect(normalize({ side: 'buy', payment_methods: [{ id: '9081' }] })).toEqual([]);
  });

  it('preserves ordinary multiline trade terms as text without interpreting markup', () => {
    const description = 'First line\nSecond line\r\n\t<label>literal text</label> ';
    expect(normalize({ description })[0].terms).toBe(description);
    expect(normalize({ description: '' })[0].terms).toBe('');
  });

  it.each([
    { asset_layer: 'ARK' },
    { asset_layer: undefined },
    { asset_code: 'ETH' },
    { currency_code: 'USD' },
    { searchable: false },
    { searchable: 'true' },
    { working_now: false },
    { working_now: undefined },
    { side: 'buy' },
    { payment_method_instructions: [{ payment_method_id: '4' }] },
    { payment_method_instructions: [{ payment_method_id: 9081 }] },
    { payment_method_instructions: [{ id: '9081' }] },
    { payment_method_instructions: null }
  ])('excludes unsupported or ineligible offers: %j', (changes) => {
    expect(normalize(changes)).toEqual([]);
  });

  it.each([
    '1e5',
    '-1',
    '+1',
    ' 1.00',
    '1.00 ',
    '01.00',
    '1,20',
    '1.',
    '.5',
    '1.001',
    'Infinity',
    'NaN',
    '',
    '90071992547409.92'
  ])('rejects non-exact or unsafe money: %s', (price) => expect(normalize({ price })).toEqual([]));

  it('accepts trailing decimal zeroes and the exact safe-integer boundary', () => {
    expect(normalize({ price: '68979.28000000' })[0].pricePerBtcCents).toBe(6_897_928);
    expect(normalize({ price: '90071992547409.91' })[0].pricePerBtcCents).toBe(
      Number.MAX_SAFE_INTEGER
    );
    expect(normalize({ price: 68_979.28 })).toEqual([]);
  });

  it.each([
    { min_amount: '0.00' },
    { min_amount: '20000' },
    { max_amount: '1.01' },
    { max_amount: '10000.001' },
    { first_trade_limit: '0' },
    { first_trade_limit: '1e2' },
    { payment_window_minutes: 0 },
    { payment_window_minutes: 10_081 },
    { confirmations: 0 },
    { confirmations: 1.5 },
    { for_experienced_users: 'false' },
    { id: '../escape' },
    { version: '' },
    { description: '<script>\u202eevil' },
    { description: 'x'.repeat(4_097) }
  ])('excludes invalid boundaries and unsafe presentation data: %j', (changes) => {
    expect(normalize(changes)).toEqual([]);
  });

  it('validates nullable reputation metadata and preserves unknown experience eligibility', () => {
    expect(
      normalize({ trader: { ...offer.trader, rating: null } })[0].counterparty.ratingBasisPoints
    ).toBeNull();
    for (const changes of [
      { rating: '1.01' },
      { rating: '-0.2' },
      { trades_count: -1 },
      { average_release_time_minutes: -1 },
      { login: 'spoof\u202eevil' }
    ])
      expect(normalize({ trader: { ...offer.trader, ...changes } })).toEqual([]);
    expect(normalize({ first_trade_limit: '200', for_experienced_users: true })[0]).toMatchObject({
      firstTradeLimitCents: 20_000,
      requiresExperiencedUser: true
    });
  });

  it.each([
    null,
    [],
    {},
    { status: 'error', offers: [] },
    { status: 'success', offers: {} },
    { status: 'success', offers: Array(101).fill(offer) }
  ])('rejects malformed envelopes with a stable error: %j', (payload) => {
    expect(() => normalizeHodlOffers(payload, 'buy', now)).toThrow(HodlPublicResponseError);
    try {
      normalizeHodlOffers(payload, 'buy', now);
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_provider_response' });
    }
  });

  it('accepts empty results, rejects invalid time, and excludes ambiguous duplicate IDs', () => {
    expect(normalizeHodlOffers({ status: 'success', offers: [] }, 'buy', now)).toEqual([]);
    expect(() => normalizeHodlOffers({ status: 'success', offers: [] }, 'buy', NaN)).toThrow(
      HodlPublicResponseError
    );
    expect(
      normalizeHodlOffers(
        { status: 'success', offers: [offer, { ...offer, version: 'other' }] },
        'buy',
        now
      )
    ).toEqual([]);
  });

  it('does not trust a provider-supplied link or mutate payloads', () => {
    const payload = { ...offer, url: 'https://evil.example', trader: { ...offer.trader } };
    const before = JSON.stringify(payload);
    const [result] = normalizeHodlOffers({ status: 'success', offers: [payload] }, 'buy', now);
    expect(result.url).toBe('https://hodlhodl.com/offers/AvalidOffer123');
    expect(JSON.stringify(payload)).toBe(before);
  });
});

describe('Hodl Hodl fixed-origin public URL', () => {
  it.each([
    ['buy', 'sell'],
    ['sell', 'buy']
  ] as const)('maps intent %s to provider side %s', (intent, side) => {
    const url = new URL(
      buildHodlOffersUrl(intent, { amountCents: 25_001, limit: 20, offset: 100 })
    );
    expect(url.origin).toBe('https://hodlhodl.com');
    expect(url.pathname).toBe('/api/v1/offers');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'pagination[limit]': '20',
      'pagination[offset]': '100',
      'filters[asset_code]': 'BTC',
      'filters[currency_code]': 'EUR',
      'filters[side]': side,
      'filters[payment_method_id]': '9081',
      'filters[only_working_now]': 'true',
      'filters[amount]': '250.01'
    });
    expect(url.username).toBe('');
    expect(url.password).toBe('');
  });

  it('has bounded pagination and cannot override the host', () => {
    expect(new URL(buildHodlOffersUrl('buy')).searchParams.get('pagination[limit]')).toBe('100');
    expect(
      new URL(buildHodlOffersUrl('buy', { origin: 'https://evil.example' } as never)).origin
    ).toBe('https://hodlhodl.com');
    for (const options of [
      { limit: 101 },
      { limit: 0 },
      { offset: -1 },
      { offset: 10_001 },
      { amountCents: 0 },
      { amountCents: 1.5 },
      { amountCents: Number.MAX_SAFE_INTEGER + 1 }
    ]) {
      expect(() => buildHodlOffersUrl('buy', options)).toThrow(RangeError);
    }
  });
});
