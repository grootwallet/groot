import { describe, expect, it } from 'vitest';
import {
  applyTradeEvent,
  bestPreviewQuotes,
  createPreviewMarketplace,
  MARKET_LIMITS,
  MarketError,
  parseEuroAmount,
  previewQuote,
  startPreviewTrade,
  type EventKind,
  type Intent,
  type MarketErrorCode,
  type PreviewOffer,
  type Trade,
  type TradeEvent
} from './index';

const offer = (overrides: Partial<PreviewOffer> = {}): PreviewOffer => ({
  id: 'fixture-peer',
  alias: 'Example peer',
  intent: 'buy',
  priceCentsPerBtc: 6_250_000,
  minCents: 5_000,
  maxCents: 25_000,
  completedTrades: 20,
  completionPercent: 98,
  available: true,
  ...overrides
});

const quote = (intent: Intent = 'buy') => previewQuote(offer({ intent }), 10_000, 1_000);
const trade = (intent: Intent = 'buy') => startPreviewTrade(quote(intent), 1_000);
const next = (current: Trade, kind: EventKind, extra: Partial<TradeEvent> = {}) =>
  applyTradeEvent(current, {
    id: `fixture-event-${current.revision + 1}`,
    tradeId: current.id,
    revision: current.revision + 1,
    kind,
    ...extra
  });
const awaitingPayment = (intent: Intent = 'buy') => next(trade(intent), 'escrow_confirmed');
const paymentClaimed = (intent: Intent = 'buy') =>
  next(awaitingPayment(intent), 'buyer_marked_paid');
const receiptAcknowledged = () =>
  next(paymentClaimed('sell'), 'seller_confirmed_receipt', { bankReceiptChecked: true });

function expectCode(action: () => unknown, code: MarketErrorCode) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(MarketError);
    expect((error as MarketError).code).toBe(code);
    return;
  }
  throw new Error(`Expected MarketError(${code})`);
}

describe('marketplace euro amount policy', () => {
  it.each([
    ['50', 5_000],
    [' 50.00 ', 5_000],
    ['50,01', 5_001],
    ['100.1', 10_010],
    ['249.99', 24_999],
    ['250.00', 25_000]
  ])('parses %s as integer cents', (input, cents) => {
    expect(parseEuroAmount(input)).toBe(cents);
  });

  it.each([
    '',
    '49.99',
    '250.01',
    '999',
    '1000',
    '-50',
    '+50',
    '5e1',
    '0x32',
    '50.000',
    '50,001',
    '50.',
    '50,',
    '1,000.00',
    '50 00',
    '５０',
    'NaN',
    'Infinity'
  ])('rejects ambiguous, malformed or out-of-scope input %j', (input) => {
    expect(parseEuroAmount(input)).toBeNull();
  });
});

describe('marketplace quote arithmetic and eligibility', () => {
  it('shows the buyer net bitcoin and seller total bitcoin including each fixture fee', () => {
    expect(quote('buy')).toMatchObject({
      grossSats: 160_000,
      platformFeeSats: 1_200,
      releaseFeeSats: 450,
      fundingFeeSats: 0,
      bitcoinSats: 158_350
    });
    expect(quote('sell')).toMatchObject({
      grossSats: 160_000,
      platformFeeSats: 1_200,
      releaseFeeSats: 450,
      fundingFeeSats: 350,
      bitcoinSats: 162_000
    });
  });

  it('rounds fractional gross sats down for buying and up for selling, and fees up', () => {
    const buy = previewQuote(offer({ priceCentsPerBtc: 3_000_000 }), 5_000, 0);
    const sell = previewQuote(offer({ intent: 'sell', priceCentsPerBtc: 3_000_000 }), 5_000, 0);
    expect(buy).toMatchObject({ grossSats: 166_666, platformFeeSats: 1_250, bitcoinSats: 164_966 });
    expect(sell).toMatchObject({
      grossSats: 166_667,
      platformFeeSats: 1_251,
      bitcoinSats: 168_718
    });
  });

  it('keeps quote accounting exact across the full supported cent range', () => {
    const fields = [
      'grossSats',
      'platformFeeSats',
      'releaseFeeSats',
      'fundingFeeSats',
      'bitcoinSats'
    ] as const;
    let checkedInputs = 0;
    let checkedAmounts = 0;
    for (let cents = MARKET_LIMITS.minCents; cents <= MARKET_LIMITS.maxCents; cents++) {
      for (const intent of ['buy', 'sell'] as const) {
        const result = previewQuote(offer({ intent, priceCentsPerBtc: 6_290_003 }), cents, 0);
        for (const field of fields) {
          const amount = result[field];
          if (!Number.isSafeInteger(amount) || amount < 0)
            throw new Error(
              `${intent} at ${cents} cents: ${field} is not a nonnegative safe integer (${amount}).`
            );
          checkedAmounts++;
        }
        const exactFiatNumerator = BigInt(cents) * 100_000_000n;
        const grossFiatNumerator = BigInt(result.grossSats) * 6_290_003n;
        const roundingRemainder =
          intent === 'buy'
            ? exactFiatNumerator - grossFiatNumerator
            : grossFiatNumerator - exactFiatNumerator;
        if (roundingRemainder < 0n || roundingRemainder >= 6_290_003n)
          throw new Error(
            `${intent} at ${cents} cents: gross rounding remainder is ${roundingRemainder}.`
          );
        const fees = result.platformFeeSats + result.releaseFeeSats + result.fundingFeeSats;
        const conservedGross =
          intent === 'buy' ? result.bitcoinSats + fees : result.bitcoinSats - fees;
        if (conservedGross !== result.grossSats)
          throw new Error(
            `${intent} at ${cents} cents: fee conservation produced ${conservedGross}, expected ${result.grossSats}.`
          );
        checkedInputs++;
      }
    }
    expect(checkedInputs).toBe(40_002);
    expect(checkedAmounts).toBe(200_010);
  });

  it.each([0, -1, 4_999, 25_001, 5_000.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid cents %s even without offers',
    (cents) => {
      expectCode(() => previewQuote(offer(), cents, 0), 'invalid_amount');
      expectCode(() => bestPreviewQuotes([], 'buy', cents, 0), 'invalid_amount');
    }
  );

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid quoted prices %s',
    (priceCentsPerBtc) => {
      expectCode(() => previewQuote(offer({ priceCentsPerBtc }), 5_000, 0), 'invalid_amount');
    }
  );

  it.each([
    { minCents: NaN },
    { maxCents: NaN },
    { minCents: 0 },
    { maxCents: -1 },
    { minCents: 5_000.5 },
    { minCents: 20_000, maxCents: 10_000 }
  ])('rejects malformed offer limits %j', (limits) => {
    expectCode(() => previewQuote(offer(limits), 10_000, 0), 'invalid_amount');
  });

  it('does not produce a buy quote whose fees consume all bitcoin', () => {
    expectCode(
      () => previewQuote(offer({ priceCentsPerBtc: Number.MAX_SAFE_INTEGER }), 5_000, 0),
      'invalid_amount'
    );
  });

  it('respects inclusive offer limits and excludes unavailable peers', () => {
    const restricted = offer({ minCents: 10_000, maxCents: 20_000 });
    expect(previewQuote(restricted, 10_000, 0).fiatCents).toBe(10_000);
    expect(previewQuote(restricted, 20_000, 0).fiatCents).toBe(20_000);
    expectCode(() => previewQuote(restricted, 9_999, 0), 'no_offers');
    expectCode(() => previewQuote(restricted, 20_001, 0), 'no_offers');
    expectCode(() => previewQuote(offer({ available: false }), 10_000, 0), 'no_offers');
  });

  it('ranks by the all-in outcome, with stable ties, without mutating the offer list', () => {
    const peers = [
      offer({ id: 'z' }),
      offer({ id: 'a' }),
      offer({ id: 'cheap', priceCentsPerBtc: 6_000_000 }),
      offer({ id: 'offline', available: false }),
      offer({ id: 'sell-only', intent: 'sell' })
    ];
    expect(bestPreviewQuotes(peers, 'buy', 10_000, 0).map((q) => q.offer.id)).toEqual([
      'cheap',
      'a',
      'z'
    ]);
    expect(
      bestPreviewQuotes(
        peers.map((o) => ({ ...o, intent: 'sell' })),
        'sell',
        10_000,
        0
      ).map((q) => q.offer.id)
    ).toEqual(['a', 'sell-only', 'z', 'cheap']);
    expect(peers.map((o) => o.id)).toEqual(['z', 'a', 'cheap', 'offline', 'sell-only']);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER - MARKET_LIMITS.quoteLifetimeMs + 1])(
    'rejects unsafe quote clocks %s',
    (now) => {
      expectCode(() => previewQuote(offer(), 10_000, now), 'invalid_amount');
      expectCode(() => bestPreviewQuotes([], 'buy', 10_000, now), 'invalid_amount');
    }
  );

  it('keeps the largest permitted quote expiry a safe integer', () => {
    const createdAt = Number.MAX_SAFE_INTEGER - MARKET_LIMITS.quoteLifetimeMs;
    expect(previewQuote(offer(), 10_000, createdAt).expiresAt).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('immutable, expiring preview trade commitment', () => {
  it('accepts a quote through its last millisecond, then rejects it exactly at expiry', () => {
    const q = quote();
    expect(startPreviewTrade(q, q.createdAt).state).toBe('escrow_pending');
    expect(startPreviewTrade(q, q.expiresAt - 1).state).toBe('escrow_pending');
    expectCode(() => startPreviewTrade(q, q.expiresAt), 'quote_expired');
    expectCode(() => startPreviewTrade(q, q.createdAt - 1), 'quote_expired');
  });

  it.each([NaN, Infinity, -1, 1_000.5])('rejects an invalid commitment clock %s', (now) => {
    expectCode(() => startPreviewTrade(quote(), now), 'quote_expired');
  });

  it.each([
    { grossSats: 1 },
    { platformFeeSats: 0 },
    { releaseFeeSats: 0 },
    { fundingFeeSats: 100 },
    { bitcoinSats: 1 },
    { intent: 'sell' as const },
    { expiresAt: NaN },
    { expiresAt: 99_999 },
    { id: 'forged-preview-id' }
  ])('rejects a changed economic quote or expiry %j', (changed) => {
    expectCode(() => startPreviewTrade({ ...quote(), ...changed }, 1_000), 'invalid_amount');
  });

  it('snapshots economic terms and peer identity before caller-owned objects can change', () => {
    const mutable = { ...quote(), offer: { ...quote().offer } };
    const committed = startPreviewTrade(mutable, 1_000);
    mutable.bitcoinSats = 1;
    mutable.offer.priceCentsPerBtc = 1;
    mutable.offer.alias = 'Substituted peer';
    expect(committed.quote.bitcoinSats).toBe(158_350);
    expect(committed.quote.offer.priceCentsPerBtc).toBe(6_250_000);
    expect(committed.quote.offer.alias).toBe('Example peer');
    expect(Object.isFrozen(committed)).toBe(true);
    expect(Object.isFrozen(committed.quote)).toBe(true);
    expect(Object.isFrozen(committed.quote.offer)).toBe(true);
    expect(Object.isFrozen(committed.eventIds)).toBe(true);
  });
});

describe('trade event binding and ordering', () => {
  it.each([
    { id: '' },
    { id: ' ' },
    { id: ' trailing ' },
    { id: 'line\nbreak' },
    { id: 'x'.repeat(161) },
    { tradeId: 'another-trade' },
    { revision: 0 },
    { revision: 2 },
    { revision: 1.5 },
    { revision: NaN },
    { revision: Number.MAX_SAFE_INTEGER + 1 }
  ])(
    'rejects malformed, orphan or out-of-order envelopes %j without changing the trade',
    (invalid) => {
      const original = trade();
      expectCode(() => next(original, 'escrow_confirmed', invalid), 'invalid_event');
      expect(original).toMatchObject({
        state: 'escrow_pending',
        revision: 0,
        lastEventId: '',
        eventIds: []
      });
    }
  );

  it('rejects a replayed event at its original revision and with a rewritten newer revision', () => {
    const original = trade();
    const escrowEvent: TradeEvent = {
      id: 'escrow-observation',
      tradeId: original.id,
      revision: 1,
      kind: 'escrow_confirmed'
    };
    const funded = applyTradeEvent(original, escrowEvent);
    expectCode(() => applyTradeEvent(funded, escrowEvent), 'invalid_event');
    expectCode(() => next(funded, 'buyer_marked_paid', { id: escrowEvent.id }), 'invalid_event');
    const paid = next(funded, 'buyer_marked_paid');
    expectCode(() => next(paid, 'release_confirmed', { id: escrowEvent.id }), 'invalid_event');
    expect(paid.state).toBe('payment_sent');
  });

  it('records immutable event identity history without changing earlier snapshots', () => {
    const original = trade();
    const funded = next(original, 'escrow_confirmed');
    const paid = next(funded, 'buyer_marked_paid');
    expect(original.eventIds).toEqual([]);
    expect(funded.eventIds).toEqual(['fixture-event-1']);
    expect(paid.eventIds).toEqual(['fixture-event-1', 'fixture-event-2']);
    expect(paid.lastEventId).toBe('fixture-event-2');
    expect(Object.isFrozen(paid.eventIds)).toBe(true);
  });

  it('bounds event history even if a caller supplies an impossible preview history', () => {
    const forged = {
      ...trade(),
      eventIds: Array.from({ length: 16 }, (_, index) => `old-${index}`)
    };
    expectCode(() => next(forged, 'escrow_confirmed'), 'invalid_event');
  });
});

describe('payment, release, cancellation and dispute safety', () => {
  it.each(['buy', 'sell'] as const)(
    'does not release bitcoin from a %s buyer payment claim or an unknown timer event',
    (intent) => {
      const funded = awaitingPayment(intent);
      expectCode(() => next(funded, 'release_confirmed'), 'invalid_transition');
      const claimed = next(funded, 'buyer_marked_paid');
      expect(claimed.state).toBe(intent === 'buy' ? 'payment_sent' : 'receipt_review');
      expectCode(() => next(claimed, 'timeout' as EventKind), 'invalid_transition');
      expect(claimed.state).not.toBe('completed');
    }
  );

  it('requires the seller to explicitly acknowledge checking receipt in their bank before release', () => {
    const claimed = paymentClaimed('sell');
    expectCode(() => next(claimed, 'seller_confirmed_receipt'), 'invalid_transition');
    expectCode(
      () => next(claimed, 'seller_confirmed_receipt', { bankReceiptChecked: false }),
      'invalid_transition'
    );
    expectCode(() => next(claimed, 'release_confirmed'), 'invalid_transition');
    const releasing = next(claimed, 'seller_confirmed_receipt', { bankReceiptChecked: true });
    expect(releasing.state).toBe('release_pending');
    expect(next(releasing, 'release_confirmed').state).toBe('completed');
  });

  it('does not let a buyer manufacture a seller receipt acknowledgement', () => {
    expectCode(
      () => next(paymentClaimed('buy'), 'seller_confirmed_receipt', { bankReceiptChecked: true }),
      'invalid_transition'
    );
  });

  it('requires a separate simulated authoritative release observation to complete a buy', () => {
    const claimed = paymentClaimed('buy');
    expect(next(claimed, 'release_confirmed').state).toBe('completed');
    expect(claimed.state).toBe('payment_sent');
  });

  it.each(['buy', 'sell'] as const)(
    'allows %s cancellation only before escrow confirmation',
    (intent) => {
      expect(next(trade(intent), 'cancel').state).toBe('cancelled');
      expectCode(() => next(awaitingPayment(intent), 'cancel'), 'invalid_transition');
      expectCode(() => next(paymentClaimed(intent), 'cancel'), 'invalid_transition');
      expectCode(() => next(paymentClaimed(intent), 'request_refund'), 'invalid_transition');
    }
  );

  it.each(['buy', 'sell'] as const)(
    'keeps a %s refund request pending until a distinct confirmation arrives',
    (intent) => {
      expectCode(() => next(awaitingPayment(intent), 'refund_confirmed'), 'invalid_transition');
      const requested = next(awaitingPayment(intent), 'request_refund');
      expect(requested.state).toBe('refund_pending');
      expectCode(() => next(requested, 'cancel'), 'invalid_transition');
      expectCode(() => next(requested, 'release_confirmed'), 'invalid_transition');
      expect(next(requested, 'refund_confirmed').state).toBe('refunded');
    }
  );

  it.each(['buy', 'sell'] as const)(
    'freezes a %s refund when a late payment claim arrives',
    (intent) => {
      const requested = next(awaitingPayment(intent), 'request_refund');
      const frozen = next(requested, 'buyer_marked_paid');
      expect(frozen.state).toBe('disputed');
      expectCode(() => next(frozen, 'refund_confirmed'), 'invalid_transition');
      expectCode(() => next(frozen, 'release_confirmed'), 'invalid_transition');
    }
  );

  it('allows disputes while payment, release or refund is pending and freezes every automated outcome', () => {
    const active = [
      awaitingPayment(),
      paymentClaimed(),
      paymentClaimed('sell'),
      receiptAcknowledged(),
      next(awaitingPayment(), 'request_refund')
    ];
    for (const current of active) {
      const frozen = next(current, 'open_dispute');
      expect(frozen.state).toBe('disputed');
      for (const kind of [
        'escrow_confirmed',
        'buyer_marked_paid',
        'seller_confirmed_receipt',
        'release_confirmed',
        'open_dispute',
        'cancel',
        'request_refund',
        'refund_confirmed'
      ] as const) {
        expectCode(() => next(frozen, kind, { bankReceiptChecked: true }), 'invalid_transition');
      }
    }
  });

  it('does not reopen completed, cancelled or refunded trades', () => {
    const terminal = [
      next(paymentClaimed(), 'release_confirmed'),
      next(trade(), 'cancel'),
      next(next(awaitingPayment(), 'request_refund'), 'refund_confirmed')
    ];
    for (const current of terminal) {
      for (const kind of [
        'escrow_confirmed',
        'buyer_marked_paid',
        'seller_confirmed_receipt',
        'release_confirmed',
        'open_dispute',
        'cancel',
        'request_refund',
        'refund_confirmed'
      ] as const) {
        expectCode(() => next(current, kind, { bankReceiptChecked: true }), 'invalid_transition');
      }
    }
  });
});

describe('deterministic preview adapter', () => {
  it('returns only explicit preview quotes with deterministic ordering at a fixed clock', async () => {
    const market = createPreviewMarketplace();
    expect(market.mode).toBe('preview');
    const first = await market.findQuotes('buy', 10_000, 'available', 1_000);
    expect(first).toEqual(await market.findQuotes('buy', 10_000, 'available', 1_000));
    expect(first).toHaveLength(2);
    expect(first.every((q) => q.mode === 'preview' && q.intent === 'buy')).toBe(true);
    expect(first[0].bitcoinSats).toBeGreaterThanOrEqual(first[1].bitcoinSats);
    const sell = await market.findQuotes('sell', 10_000, 'available', 1_000);
    expect(sell[0].bitcoinSats).toBeLessThanOrEqual(sell[1].bitcoinSats);
  });

  it('distinguishes no liquidity from service unavailability without inventing fallback offers', async () => {
    const market = createPreviewMarketplace();
    await expect(market.findQuotes('buy', 10_000, 'empty', 1_000)).resolves.toEqual([]);
    await expect(market.findQuotes('buy', 10_000, 'offline', 1_000)).rejects.toMatchObject({
      code: 'unavailable'
    });
    const invalid = market.findQuotes('buy', 4_999, 'empty', 1_000);
    await expect(invalid).rejects.toMatchObject({ code: 'invalid_amount' });
  });
});
