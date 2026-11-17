import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  comparePublicOffers,
  DiscoveryError,
  isPublicOfferSnapshotFresh,
  loadPublicOffers as loadProviderOffers,
  type DiscoveryRequest,
  type DiscoveryClientOptions
} from '../../../packages/marketplace/discovery';
import { normalizeHodlOffers, type HodlPublicOffer } from '../../../packages/marketplace/hodlhodl';

const now = 1_799_999_000_000;
const request = { intent: 'buy', amountCents: 10_000 } as const;
const rawOffer = {
  id: 'example-offer',
  version: 'v1',
  asset_code: 'BTC',
  asset_layer: 'BTC',
  currency_code: 'EUR',
  side: 'sell',
  searchable: true,
  working_now: true,
  price: '69000.00',
  min_amount: '50.00',
  max_amount: '250.00',
  first_trade_limit: null,
  for_experienced_users: false,
  payment_window_minutes: 90,
  confirmations: 1,
  description: null,
  payment_method_instructions: [{ payment_method_id: '9081' }],
  trader: { login: 'example-trader', rating: '1.00', trades_count: 64 }
};
const baseOffer = normalizeHodlOffers({ status: 'success', offers: [rawOffer] }, 'buy', now)[0];
const offer = (changes: Partial<HodlPublicOffer> = {}): HodlPublicOffer => ({
  ...baseOffer,
  ...changes
});
const response = (payload: unknown = { status: 'success', offers: [rawOffer] }) =>
  new Response(JSON.stringify({ provider: 'hodlhodl', payload }), {
    headers: { 'Content-Type': 'application/json' }
  });
const client = (reply: Response = response()) => vi.fn<typeof fetch>().mockResolvedValue(reply);
const loadPublicOffers = (query: DiscoveryRequest, options: DiscoveryClientOptions = {}) =>
  loadProviderOffers(query, { provider: 'hodlhodl', ...options });
const rawLocalCoinSwapOffer = {
  uuid: '12a45678-1234-4234-8234-123456789abc',
  slug: 'buy-btc-for-eur-fixture',
  coin_currency: { symbol: 'BTC', slug: 'BTC', is_crypto: true, token_standard: null },
  fiat_currency: { symbol: 'EUR', is_crypto: false, token_standard: null },
  trading_type: { slug: 'sell' },
  payment_method: { slug: 'sepa-instant' },
  min_trade_size: '50.0000000000',
  max_trade_size: '250.0000000000',
  price_formula_value: '91965.57838471547',
  minimum_feedback: '0',
  sms_required: false,
  enforced_sizes: '',
  created_by: {
    username: 'example-trader',
    user_uuid: '23a45678-1234-4234-9234-123456789abc',
    activity_status: 'active',
    last_seen: now / 1_000 - 30,
    completed_trades: 27,
    feedback_score: '5.00000'
  }
};

afterEach(() => vi.useRealTimers());

describe('public listing comparison', () => {
  it.each([5_000, 25_000])('accepts the exact supported EUR limit %s', (amountCents) => {
    expect(comparePublicOffers([offer()], { ...request, amountCents })).toHaveLength(1);
  });

  it.each([4_999, 25_001, 10_000.1, NaN, Infinity])(
    'rejects unsupported cents %s',
    (amountCents) => {
      expect(() => comparePublicOffers([], { ...request, amountCents })).toThrow(RangeError);
    }
  );

  it('rejects an invalid intent before any network request', async () => {
    const fetch = client();
    const invalid = { ...request, intent: 'swap' } as unknown as DiscoveryRequest;
    expect(() => comparePublicOffers([], invalid)).toThrow(RangeError);
    await expect(loadPublicOffers(invalid, { fetch })).rejects.toThrow(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { intent: 'sell' },
    { currency: 'USD' },
    { paymentMethod: 'cash' },
    { minFiatCents: 10_001 },
    { maxFiatCents: 9_999 },
    { firstTradeLimitCents: 9_999 },
    { requiresExperiencedUser: true },
    { requiresPhoneVerification: true },
    { minimumFeedbackPercent: 1 }
  ])('excludes a known mismatch or newcomer restriction %j', (changes) => {
    expect(comparePublicOffers([offer(changes as Partial<HodlPublicOffer>)], request)).toEqual([]);
  });

  it('honors inclusive listing and first-trade limits', () => {
    expect(
      comparePublicOffers(
        [offer({ minFiatCents: 10_000, maxFiatCents: 10_000, firstTradeLimitCents: 10_000 })],
        request
      )
    ).toHaveLength(1);
  });

  it('preserves unknown experience eligibility and never promises provider acceptance', () => {
    const [unknown] = comparePublicOffers([offer({ requiresExperiencedUser: null })], request);
    expect(unknown.eligibility).toBe('unknown');
    expect(unknown.offer.requiresExperiencedUser).toBeNull();
    const [known] = comparePublicOffers([offer()], request);
    expect(known.eligibility).toBe('public_requirements_met');
    expect(known).not.toHaveProperty('guaranteedEligible');
  });

  it.each(['buy', 'sell'] as const)(
    'sorts %s only by advertised price, then stable ID',
    (intent) => {
      const offers = [
        offer({ id: 'b', intent, pricePerBtcCents: 7_000_000 }),
        offer({
          id: 'c',
          intent,
          pricePerBtcCents: 6_000_000,
          counterparty: { ...baseOffer.counterparty, alias: 'trader-c' }
        }),
        offer({
          id: 'a',
          intent,
          pricePerBtcCents: 7_000_000,
          counterparty: { ...baseOffer.counterparty, alias: 'trader-a', completedTrades: 0 }
        })
      ];
      expect(
        comparePublicOffers(offers, { ...request, intent }).map((candidate) => candidate.offer.id)
      ).toEqual(intent === 'buy' ? ['c', 'a', 'b'] : ['a', 'b', 'c']);
      expect(offers.map((offer) => offer.id)).toEqual(['b', 'c', 'a']);
    }
  );

  it('groups eligible listings by exact trader identity and retains the additional count', () => {
    const offers = [
      offer({ id: 'more-expensive', pricePerBtcCents: 7_000_000 }),
      offer({ id: 'cheap-z', pricePerBtcCents: 6_000_000 }),
      offer({ id: 'cheap-a', pricePerBtcCents: 6_000_000 }),
      offer({ id: 'restricted', requiresExperiencedUser: true })
    ];
    expect(comparePublicOffers(offers, request)).toMatchObject([
      { offer: { id: 'cheap-a' }, additionalOfferCount: 2 }
    ]);
  });

  it('deduplicates by provider trader ID rather than a changeable alias when one is supplied', () => {
    const offers = [
      offer({
        id: 'a',
        counterparty: { ...baseOffer.counterparty, id: 'same-trader', alias: 'old' }
      }),
      offer({
        id: 'b',
        counterparty: { ...baseOffer.counterparty, id: 'same-trader', alias: 'new' }
      }),
      offer({
        id: 'c',
        counterparty: { ...baseOffer.counterparty, id: 'other-trader', alias: 'old' }
      })
    ];
    expect(comparePublicOffers(offers, request)).toMatchObject([
      { offer: { id: 'a' }, additionalOfferCount: 1 },
      { offer: { id: 'c' }, additionalOfferCount: 0 }
    ]);
  });

  it.each(['buy', 'sell'] as const)(
    'compares exact subcent %s prices without floating point',
    (intent) => {
      const offers = [
        offer({
          id: 'a',
          intent,
          pricePerBtcCents: 10_000,
          exactPricePerBtc: { units: '100000000000000000002', scale: 18 }
        }),
        offer({
          id: 'z',
          intent,
          pricePerBtcCents: 10_000,
          exactPricePerBtc: { units: '100000000000000000001', scale: 18 },
          counterparty: { ...baseOffer.counterparty, alias: 'another' }
        })
      ];
      expect(
        comparePublicOffers(offers, { ...request, intent }).map((row) => row.offer.id)
      ).toEqual(intent === 'buy' ? ['z', 'a'] : ['a', 'z']);
    }
  );

  it('uses exact subcent prices for conservative gross sats and compares different scales', () => {
    const [buy] = comparePublicOffers(
      [
        offer({
          pricePerBtcCents: 10_000,
          exactPricePerBtc: { units: '100000000000000000001', scale: 18 }
        })
      ],
      request
    );
    expect(buy.grossEstimateSats).toBe(99_999_999);
    const [sell] = comparePublicOffers(
      [
        offer({
          intent: 'sell',
          pricePerBtcCents: 10_000,
          exactPricePerBtc: { units: '99999999999999999999', scale: 18 }
        })
      ],
      { ...request, intent: 'sell' }
    );
    expect(sell.grossEstimateSats).toBe(100_000_001);
    expect(
      comparePublicOffers(
        [
          offer({ id: 'z', exactPricePerBtc: { units: '100', scale: 0 } }),
          offer({
            id: 'a',
            exactPricePerBtc: { units: '100000', scale: 3 },
            counterparty: { ...baseOffer.counterparty, alias: 'another' }
          })
        ],
        request
      ).map((row) => row.offer.id)
    ).toEqual(['a', 'z']);
  });

  it.each([
    { units: '0', scale: 2 },
    { units: '01', scale: 2 },
    { units: '-1', scale: 2 },
    { units: '1e5', scale: 2 },
    { units: '1'.repeat(37), scale: 2 },
    { units: '1', scale: -1 },
    { units: '1', scale: 19 },
    { units: '1', scale: 1.5 },
    { units: '1', scale: 18 }
  ])('excludes malformed exact prices and unsafe gross arithmetic %j', (exactPricePerBtc) => {
    expect(comparePublicOffers([offer({ exactPricePerBtc })], request)).toEqual([]);
  });

  it('rounds the advertised-price gross indication in integer sats without guessing fees', () => {
    const [buy] = comparePublicOffers([offer({ pricePerBtcCents: 7_000_000 })], request);
    const [sell] = comparePublicOffers([offer({ intent: 'sell', pricePerBtcCents: 7_000_000 })], {
      ...request,
      intent: 'sell'
    });
    expect(buy.grossEstimateSats).toBe(142_857);
    expect(sell.grossEstimateSats).toBe(142_858);
    for (const candidate of [buy, sell]) {
      expect(candidate).not.toHaveProperty('netSats');
      expect(candidate).not.toHaveProperty('feeSats');
      expect(candidate).not.toHaveProperty('quote');
      expect(candidate).not.toHaveProperty('best');
    }
  });

  it('avoids intermediate floating point multiplication even near the price boundary', () => {
    expect(
      comparePublicOffers([offer({ pricePerBtcCents: Number.MAX_SAFE_INTEGER })], request)
    ).toEqual([]);
    expect(
      comparePublicOffers([offer({ pricePerBtcCents: 1 })], { ...request, amountCents: 25_000 })[0]
        .grossEstimateSats
    ).toBe(2_500_000_000_000);
  });

  it('excludes an exact advertised price yielding zero sats and accepts the one-satoshi boundary', () => {
    const exactBoundary = { pricePerBtcCents: 1_000_000_000_000 };
    expect(
      comparePublicOffers(
        [
          offer({
            ...exactBoundary,
            exactPricePerBtc: { units: '10000000001', scale: 0 }
          })
        ],
        request
      )
    ).toEqual([]);
    expect(
      comparePublicOffers(
        [
          offer({
            ...exactBoundary,
            exactPricePerBtc: { units: '10000000000', scale: 0 }
          })
        ],
        request
      )[0].grossEstimateSats
    ).toBe(1);
  });
});

describe('explicit bounded discovery client', () => {
  it.each(['buy', 'sell'] as const)(
    'defaults to only LocalCoinSwap for %s and preserves exact source price arithmetic',
    async (intent) => {
      const fetch = client(
        new Response(
          JSON.stringify({
            provider: 'localcoinswap',
            payload: {
              count: 1,
              results: [
                {
                  ...rawLocalCoinSwapOffer,
                  trading_type: { slug: intent === 'buy' ? 'sell' : 'buy' }
                }
              ]
            }
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
      const snapshot = await loadProviderOffers({ ...request, intent }, { fetch, now: () => now });
      const numerator = 10_000n * 1_000_000n * 100_000_000_000n;
      const units = 9_196_557_838_471_547n;
      expect(snapshot.provider).toBe('localcoinswap');
      expect(snapshot.offers).toHaveLength(1);
      expect(snapshot.offers[0].grossEstimateSats).toBe(
        Number(intent === 'buy' ? numerator / units : (numerator + units - 1n) / units)
      );
      expect(snapshot.offers[0]).toMatchObject({
        eligibility: 'unknown',
        offer: {
          provider: 'localcoinswap',
          paymentWindowMinutes: null,
          confirmations: null,
          counterparty: { completedTrades: 27, ratingBasisPoints: null }
        }
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('never automatically falls back to another provider after a mismatched response', async () => {
    const fetch = client(response());
    await expect(loadProviderOffers(request, { fetch, now: () => now })).rejects.toMatchObject({
      code: 'invalid_response'
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('has no request on import and contacts only the same-origin relay with privacy bounds', async () => {
    const fetch = client();
    expect(fetch).not.toHaveBeenCalled();
    const snapshot = await loadPublicOffers(request, { fetch, now: () => now });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/__groot_marketplace/offers?intent=buy&amountCents=10000');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', 'X-Groot-Marketplace-Request': '1' }
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(snapshot).toMatchObject({
      ...request,
      receivedAtMs: now,
      expiresAtMs: now + 60_000,
      additionalOfferCount: 0,
      offers: [{ offer: { id: 'example-offer', observedAtMs: now } }]
    });
  });

  it('timestamps receipt rather than request initiation and preserves an honest empty inventory', async () => {
    const fetch = client(response({ status: 'success', offers: [] }));
    const time = vi.fn(() => now + 5_000);
    const snapshot = await loadPublicOffers({ ...request, intent: 'sell' }, { fetch, now: time });
    expect(time).toHaveBeenCalledTimes(1);
    expect(snapshot.offers).toEqual([]);
    expect(snapshot.receivedAtMs).toBe(now + 5_000);
    expect(fetch.mock.calls[0][0]).toContain('intent=sell');
  });

  it('normalizes once, excludes unsupported rows and totals additional listings', async () => {
    const fetch = client(
      response({
        status: 'success',
        offers: [
          rawOffer,
          { ...rawOffer, id: 'second' },
          { ...rawOffer, id: 'bad', asset_code: 'ETH' }
        ]
      })
    );
    const snapshot = await loadPublicOffers(request, { fetch, now: () => now });
    expect(snapshot.offers).toHaveLength(1);
    expect(snapshot.additionalOfferCount).toBe(1);
  });

  it.each([400, 401, 403, 404, 422, 500, 502, 503])(
    'maps HTTP %s to unavailable without displaying arbitrary error text',
    async (status) => {
      const fetch = client(new Response('private provider details', { status }));
      await expect(loadPublicOffers(request, { fetch })).rejects.toMatchObject({
        code: 'unavailable'
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['12', 12_000],
    ['600', 600_000],
    ['0', 0],
    ['86400', 86_400_000],
    ['86401', 86_400_000],
    ['9999999999', 86_400_000],
    ['garbage', 30_000],
    ['-2', 30_000]
  ])('bounds Retry-After %s without retrying', async (header, delay) => {
    const fetch = client(
      new Response('ignored', { status: 429, headers: { 'Retry-After': header } })
    );
    await expect(loadPublicOffers(request, { fetch, now: () => now })).rejects.toMatchObject({
      code: 'rate_limited',
      retryAtMs: now + Number(delay)
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts a bounded HTTP-date Retry-After and a missing-header default', async () => {
    for (const [headers, delay] of [
      [{ 'Retry-After': new Date(now + 120_000).toUTCString() }, 120_000],
      [{ 'Retry-After': new Date(now + 600_000).toUTCString() }, 600_000],
      [{ 'Retry-After': new Date(now + 172_800_000).toUTCString() }, 86_400_000],
      [{ 'Retry-After': new Date(now - 120_000).toUTCString() }, 0],
      [{}, 30_000]
    ] as const) {
      await expect(
        loadPublicOffers(request, {
          fetch: client(new Response('', { status: 429, headers })),
          now: () => now
        })
      ).rejects.toMatchObject({ code: 'rate_limited', retryAtMs: now + delay });
    }
  });

  it('keeps a retry timestamp safe at the clock boundary', async () => {
    await expect(
      loadPublicOffers(request, {
        fetch: client(new Response('', { status: 429, headers: { 'Retry-After': '999999' } })),
        now: () => Number.MAX_SAFE_INTEGER - 60_000
      })
    ).rejects.toMatchObject({ code: 'rate_limited', retryAtMs: Number.MAX_SAFE_INTEGER });
  });

  it.each([
    null,
    { status: 'failure', message: 'untrusted' },
    { status: 'success', offers: {} },
    { status: 'success', offers: Array(101).fill(rawOffer) }
  ])('rejects malformed public envelopes %j', async (payload) => {
    await expect(
      loadPublicOffers(request, { fetch: client(response(payload)), now: () => now })
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it.each([
    { status: 'success', offers: [] },
    { provider: 'localcoinswap', payload: { status: 'success', offers: [] } },
    { provider: 'unknown', payload: { status: 'success', offers: [] } },
    { provider: 'hodlhodl' },
    null,
    []
  ])('rejects an unwrapped or confused-provider relay envelope %j', async (envelope) => {
    const fetch = client(
      new Response(JSON.stringify(envelope), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(loadPublicOffers(request, { fetch, now: () => now })).rejects.toMatchObject({
      code: 'invalid_response'
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported configured provider before fetching', async () => {
    const fetch = client();
    await expect(
      loadPublicOffers(request, { fetch, provider: 'unknown' as never })
    ).rejects.toThrow(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', {
      headers: { 'Content-Type': 'application/json', 'Content-Length': '524289' }
    }),
    new Response('{}', {
      headers: { 'Content-Type': 'application/json', 'Content-Length': 'nope' }
    }),
    new Response(null, { headers: { 'Content-Type': 'application/json' } })
  ])('rejects malformed encoding, content type or byte declarations', async (reply) => {
    await expect(
      loadPublicOffers(request, { fetch: client(reply), now: () => now })
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('cancels a stream that crosses the size limit even when Content-Length lies', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(524_289));
      },
      cancel
    });
    await expect(
      loadPublicOffers(request, {
        fetch: client(
          new Response(body, {
            headers: { 'Content-Type': 'application/json', 'Content-Length': '1' }
          })
        ),
        now: () => now
      })
    ).rejects.toMatchObject({ code: 'invalid_response' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('accepts a response at the exact byte bound across stream chunks', async () => {
    const json = JSON.stringify({
      provider: 'hodlhodl',
      payload: { status: 'success', offers: [] }
    });
    const bytes = new TextEncoder().encode(json.padEnd(524_288, ' '));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 123));
        controller.enqueue(bytes.slice(123));
        controller.close();
      }
    });
    const snapshot = await loadPublicOffers(request, {
      fetch: client(
        new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
      ),
      now: () => now
    });
    expect(snapshot.offers).toEqual([]);
  });

  it('maps transport rejection to a stable unavailable error', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error('sensitive network detail'));
    await expect(loadPublicOffers(request, { fetch })).rejects.toEqual(
      new DiscoveryError('unavailable')
    );
  });

  it('does not start a request after prior cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = client();
    await expect(
      loadPublicOffers(request, { fetch, signal: controller.signal })
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds a fetch that ignores its abort signal and removes timers/listeners', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(new Promise(() => {}));
    const result = expect(
      loadPublicOffers(request, { fetch, signal: controller.signal })
    ).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(remove).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled response stream on timeout', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const pending = expect(
      loadPublicOffers(request, {
        fetch: client(new Response(body, { headers: { 'Content-Type': 'application/json' } })),
        timeoutMs: 5
      })
    ).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(5);
    await pending;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps an explicit mid-flight cancellation to aborted, with no retry', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(new Promise(() => {}));
    const pending = expect(
      loadPublicOffers(request, { fetch, signal: controller.signal })
    ).rejects.toMatchObject({ code: 'aborted' });
    controller.abort();
    await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('cancels a response arriving after a timeout and leaves no unhandled work', async () => {
    vi.useFakeTimers();
    let resolve: (value: Response) => void = () => {};
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const pending = expect(
      loadPublicOffers(request, { fetch, timeoutMs: 1 })
    ).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    const cancel = vi.fn();
    resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await vi.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cleans up after success and rejects invalid clocks or timeout options', async () => {
    vi.useFakeTimers();
    await loadPublicOffers(request, { fetch: client(), now: () => now });
    expect(vi.getTimerCount()).toBe(0);
    for (const time of [NaN, -1, Number.MAX_SAFE_INTEGER]) {
      await expect(
        loadPublicOffers(request, { fetch: client(), now: () => time })
      ).rejects.toMatchObject({ code: 'invalid_response' });
    }
    for (const timeoutMs of [0, -1, 10_001, 1.5, Infinity]) {
      const fetch = client();
      await expect(loadPublicOffers(request, { fetch, timeoutMs })).rejects.toThrow(RangeError);
      expect(fetch).not.toHaveBeenCalled();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('public discovery freshness', () => {
  it('expires at sixty seconds and rejects future or tampered timestamps', async () => {
    const snapshot = await loadPublicOffers(request, { fetch: client(), now: () => now });
    expect(isPublicOfferSnapshotFresh(snapshot, now)).toBe(true);
    expect(isPublicOfferSnapshotFresh(snapshot, now + 59_999)).toBe(true);
    expect(isPublicOfferSnapshotFresh(snapshot, now + 60_000)).toBe(false);
    expect(isPublicOfferSnapshotFresh(snapshot, now - 1)).toBe(false);
    expect(isPublicOfferSnapshotFresh(snapshot, NaN)).toBe(false);
    expect(isPublicOfferSnapshotFresh({ ...snapshot, receivedAtMs: -1 }, now)).toBe(false);
    expect(isPublicOfferSnapshotFresh({ ...snapshot, expiresAtMs: now + 120_000 }, now)).toBe(
      false
    );
  });
});
