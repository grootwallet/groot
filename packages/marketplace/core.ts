/** Portable marketplace policy. No wallet access, storage, networking or UI imports. */
export type Intent = 'buy' | 'sell';
export type MarketErrorCode =
  | 'invalid_amount'
  | 'quote_expired'
  | 'unavailable'
  | 'no_offers'
  | 'invalid_transition'
  | 'invalid_event';

export class MarketError extends Error {
  constructor(public readonly code: MarketErrorCode) {
    super(code);
    this.name = 'MarketError';
  }
}

export const MARKET_LIMITS = {
  minCents: 5_000,
  maxCents: 25_000,
  quoteLifetimeMs: 60_000
} as const;

/** Decimal fiat input, never floating-point BTC. No grouping, exponent or sign. */
export function parseEuroAmount(input: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents >= MARKET_LIMITS.minCents && cents <= MARKET_LIMITS.maxCents ? cents : null;
}

export type PreviewOffer = Readonly<{
  id: string;
  alias: string;
  intent: Intent;
  priceCentsPerBtc: number;
  minCents: number;
  maxCents: number;
  completedTrades: number;
  completionPercent: number;
  available: boolean;
}>;

export type PreviewQuote = Readonly<{
  id: string;
  mode: 'preview';
  intent: Intent;
  offer: PreviewOffer;
  fiatCents: number;
  grossSats: number;
  platformFeeSats: number;
  releaseFeeSats: number;
  fundingFeeSats: number;
  bitcoinSats: number;
  createdAt: number;
  expiresAt: number;
}>;

const positiveInteger = (n: number) => Number.isSafeInteger(n) && n > 0;
const ceilDivide = (a: bigint, b: bigint) => (a + b - 1n) / b;
const validIntent = (intent: Intent) => intent === 'buy' || intent === 'sell';
const validQuoteInput = (fiatCents: number, nowMs: number) =>
  positiveInteger(fiatCents) &&
  fiatCents >= MARKET_LIMITS.minCents &&
  fiatCents <= MARKET_LIMITS.maxCents &&
  Number.isSafeInteger(nowMs) &&
  nowMs >= 0 &&
  nowMs <= Number.MAX_SAFE_INTEGER - MARKET_LIMITS.quoteLifetimeMs;

/** Fixture fee assumptions, NOT a Hodl Hodl executable quote or transaction review. */
export function previewQuote(offer: PreviewOffer, fiatCents: number, nowMs: number): PreviewQuote {
  if (
    !validQuoteInput(fiatCents, nowMs) ||
    !validIntent(offer.intent) ||
    !positiveInteger(offer.priceCentsPerBtc) ||
    !positiveInteger(offer.minCents) ||
    !positiveInteger(offer.maxCents) ||
    offer.minCents > offer.maxCents
  )
    throw new MarketError('invalid_amount');
  if (!offer.available || fiatCents < offer.minCents || fiatCents > offer.maxCents)
    throw new MarketError('no_offers');

  const numerator = BigInt(fiatCents) * 100_000_000n;
  const price = BigInt(offer.priceCentsPerBtc);
  const gross = offer.intent === 'buy' ? numerator / price : ceilDivide(numerator, price);
  const platform = ceilDivide(gross * 75n, 10_000n);
  const release = 450n;
  const funding = offer.intent === 'sell' ? 350n : 0n;
  const bitcoin =
    offer.intent === 'buy' ? gross - platform - release : gross + platform + release + funding;
  if (bitcoin <= 0n || bitcoin > BigInt(Number.MAX_SAFE_INTEGER))
    throw new MarketError('invalid_amount');
  return Object.freeze({
    id: `preview-${offer.id}-${fiatCents}-${nowMs}`,
    mode: 'preview',
    intent: offer.intent,
    offer: Object.freeze({ ...offer }),
    fiatCents,
    grossSats: Number(gross),
    platformFeeSats: Number(platform),
    releaseFeeSats: Number(release),
    fundingFeeSats: Number(funding),
    bitcoinSats: Number(bitcoin),
    createdAt: nowMs,
    expiresAt: nowMs + MARKET_LIMITS.quoteLifetimeMs
  });
}

export function bestPreviewQuotes(
  offers: readonly PreviewOffer[],
  intent: Intent,
  cents: number,
  nowMs: number
) {
  if (!validIntent(intent) || !validQuoteInput(cents, nowMs))
    throw new MarketError('invalid_amount');
  return offers
    .filter((o) => o.intent === intent && o.available && cents >= o.minCents && cents <= o.maxCents)
    .map((o) => previewQuote(o, cents, nowMs))
    .sort(
      (a, b) =>
        (intent === 'buy' ? b.bitcoinSats - a.bitcoinSats : a.bitcoinSats - b.bitcoinSats) ||
        a.offer.id.localeCompare(b.offer.id)
    );
}

export type TradeState =
  | 'escrow_pending'
  | 'awaiting_payment'
  | 'payment_sent'
  | 'receipt_review'
  | 'release_pending'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded';
export type Trade = Readonly<{
  id: string;
  quote: PreviewQuote;
  state: TradeState;
  revision: number;
  lastEventId: string;
  eventIds: readonly string[];
}>;
export type EventKind =
  | 'escrow_confirmed'
  | 'buyer_marked_paid'
  | 'seller_confirmed_receipt'
  | 'release_confirmed'
  | 'open_dispute'
  | 'cancel'
  | 'request_refund'
  | 'refund_confirmed';
export type TradeEvent = Readonly<{
  id: string;
  tradeId: string;
  revision: number;
  kind: EventKind;
  bankReceiptChecked?: boolean;
}>;

export function startPreviewTrade(quote: PreviewQuote, nowMs: number): Trade {
  const snapshot = previewQuote(quote.offer, quote.fiatCents, quote.createdAt);
  if (
    quote.mode !== snapshot.mode ||
    quote.id !== snapshot.id ||
    quote.intent !== snapshot.intent ||
    quote.grossSats !== snapshot.grossSats ||
    quote.platformFeeSats !== snapshot.platformFeeSats ||
    quote.releaseFeeSats !== snapshot.releaseFeeSats ||
    quote.fundingFeeSats !== snapshot.fundingFeeSats ||
    quote.bitcoinSats !== snapshot.bitcoinSats ||
    quote.expiresAt !== snapshot.expiresAt
  )
    throw new MarketError('invalid_amount');
  if (!Number.isSafeInteger(nowMs) || nowMs < quote.createdAt || nowMs >= quote.expiresAt)
    throw new MarketError('quote_expired');
  return Object.freeze({
    id: `trade-${snapshot.id}`,
    quote: snapshot,
    state: 'escrow_pending',
    revision: 0,
    lastEventId: '',
    eventIds: Object.freeze([])
  });
}

/** Ordered, contract-bound events. A fiat claim, timer or chat message never releases escrow. */
export function applyTradeEvent(trade: Trade, event: TradeEvent): Trade {
  // All preview paths terminate within a handful of transitions. Bound history even for malformed input.
  if (
    typeof event.id !== 'string' ||
    !event.id ||
    event.id !== event.id.trim() ||
    /[\u0000-\u001f\u007f]/.test(event.id) ||
    event.id.length > 160 ||
    trade.eventIds.length >= 16 ||
    trade.eventIds.includes(event.id) ||
    event.tradeId !== trade.id ||
    !Number.isSafeInteger(event.revision) ||
    event.revision !== trade.revision + 1
  )
    throw new MarketError('invalid_event');
  let state: TradeState | undefined;
  switch (event.kind) {
    case 'escrow_confirmed':
      if (trade.state === 'escrow_pending') state = 'awaiting_payment';
      break;
    case 'buyer_marked_paid':
      if (trade.state === 'awaiting_payment')
        state = trade.quote.intent === 'buy' ? 'payment_sent' : 'receipt_review';
      // A late claim must freeze a requested refund for dispute resolution, never silently refund.
      if (trade.state === 'refund_pending') state = 'disputed';
      break;
    case 'seller_confirmed_receipt':
      if (
        trade.quote.intent === 'sell' &&
        trade.state === 'receipt_review' &&
        event.bankReceiptChecked === true
      )
        state = 'release_pending';
      break;
    case 'release_confirmed':
      if (trade.state === 'payment_sent' || trade.state === 'release_pending') state = 'completed';
      break;
    case 'open_dispute':
      if (
        [
          'awaiting_payment',
          'payment_sent',
          'receipt_review',
          'release_pending',
          'refund_pending'
        ].includes(trade.state)
      )
        state = 'disputed';
      break;
    case 'cancel':
      if (trade.state === 'escrow_pending') state = 'cancelled';
      break;
    case 'request_refund':
      if (trade.state === 'awaiting_payment') state = 'refund_pending';
      break;
    case 'refund_confirmed':
      if (trade.state === 'refund_pending') state = 'refunded';
      break;
  }
  if (!state) throw new MarketError('invalid_transition');
  return Object.freeze({
    ...trade,
    state,
    revision: event.revision,
    lastEventId: event.id,
    eventIds: Object.freeze([...trade.eventIds, event.id])
  });
}
