/** Public discovery only. These records are not executable quotes or net-receipt promises. */
import type { MarketplaceIntent, PublicOffer } from './public-offer';
export type { MarketplaceIntent } from './public-offer';

export interface HodlPublicOffer extends PublicOffer {
  readonly provider: 'hodlhodl';
  readonly version: string;
  readonly paymentWindowMinutes: number;
  readonly confirmations: number;
  readonly counterparty: PublicOffer['counterparty'] & {
    readonly completedTrades: number;
  };
}

export class HodlPublicResponseError extends Error {
  readonly code = 'invalid_provider_response';

  constructor() {
    super('The marketplace provider returned an invalid public offer response.');
    this.name = 'HodlPublicResponseError';
  }
}

const ORIGIN = 'https://hodlhodl.com';
const MAX_PAGE_SIZE = 100;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function termsText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 4_096 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

/** Decimal strings only: no exponent, float coercion, rounding, or unsafe integer conversion. */
function scaledDecimal(value: unknown, scale: number): number | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const match = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,8}))?$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (/[1-9]/.test(fraction.slice(scale))) return null;
  const scaled =
    BigInt(match[1]) * 10n ** BigInt(scale) + BigInt(fraction.slice(0, scale).padEnd(scale, '0'));
  return scaled <= MAX_SAFE ? Number(scaled) : null;
}

function nullableMinutes(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return integer(value, 0, 525_600) ? value : undefined;
}

function normalizeOffer(
  candidate: unknown,
  intent: MarketplaceIntent,
  nowMs: number
): HodlPublicOffer | null {
  const offer = record(candidate);
  if (
    !offer ||
    offer.asset_code !== 'BTC' ||
    offer.asset_layer !== 'BTC' ||
    offer.currency_code !== 'EUR' ||
    offer.side !== (intent === 'buy' ? 'sell' : 'buy') ||
    offer.searchable !== true ||
    offer.working_now !== true ||
    !identifier(offer.id) ||
    !identifier(offer.version)
  )
    return null;

  const methods = offer.side === 'sell' ? offer.payment_method_instructions : offer.payment_methods;
  if (
    !Array.isArray(methods) ||
    methods.length > 100 ||
    !methods.some((candidate) => {
      const method = record(candidate);
      return method && (offer.side === 'sell' ? method.payment_method_id : method.id) === '9081';
    })
  )
    return null;

  const price = scaledDecimal(offer.price, 2);
  const min = scaledDecimal(offer.min_amount, 2);
  const max = scaledDecimal(offer.max_amount, 2);
  const firstTradeLimit =
    offer.first_trade_limit === null || offer.first_trade_limit === undefined
      ? null
      : scaledDecimal(offer.first_trade_limit, 2);
  if (
    price === null ||
    price <= 0 ||
    min === null ||
    min <= 0 ||
    max === null ||
    max < min ||
    (offer.first_trade_limit != null && (firstTradeLimit === null || firstTradeLimit <= 0)) ||
    !integer(offer.payment_window_minutes, 1, 10_080) ||
    !integer(offer.confirmations, 1, 144) ||
    (offer.for_experienced_users != null && typeof offer.for_experienced_users !== 'boolean')
  )
    return null;

  const trader = record(offer.trader);
  if (
    !trader ||
    !text(trader.login, 80) ||
    !integer(trader.trades_count, 0, Number.MAX_SAFE_INTEGER)
  )
    return null;
  const rating =
    trader.rating === null || trader.rating === undefined ? null : scaledDecimal(trader.rating, 4);
  const paymentMinutes = nullableMinutes(trader.average_payment_time_minutes);
  const releaseMinutes = nullableMinutes(trader.average_release_time_minutes);
  if (
    (trader.rating != null && (rating === null || rating > 10_000)) ||
    paymentMinutes === undefined ||
    releaseMinutes === undefined ||
    (offer.description != null && !termsText(offer.description))
  )
    return null;

  return {
    provider: 'hodlhodl',
    indicative: true,
    id: offer.id,
    version: offer.version,
    intent,
    currency: 'EUR',
    paymentMethod: 'sepa_instant',
    pricePerBtcCents: price,
    minFiatCents: min,
    maxFiatCents: max,
    firstTradeLimitCents: firstTradeLimit,
    requiresExperiencedUser:
      typeof offer.for_experienced_users === 'boolean' ? offer.for_experienced_users : null,
    paymentWindowMinutes: offer.payment_window_minutes,
    confirmations: offer.confirmations,
    terms: (offer.description as string | null | undefined) ?? null,
    counterparty: {
      alias: trader.login,
      completedTrades: trader.trades_count,
      ratingBasisPoints: rating,
      averagePaymentMinutes: paymentMinutes,
      averageReleaseMinutes: releaseMinutes
    },
    observedAtMs: nowMs,
    url: `${ORIGIN}/offers/${encodeURIComponent(offer.id)}`
  };
}

export function normalizeHodlOffers(
  payload: unknown,
  intent: MarketplaceIntent,
  nowMs: number
): HodlPublicOffer[] {
  const envelope = record(payload);
  if (
    (intent !== 'buy' && intent !== 'sell') ||
    !integer(nowMs, 0, Number.MAX_SAFE_INTEGER) ||
    !envelope ||
    envelope.status !== 'success' ||
    !Array.isArray(envelope.offers) ||
    envelope.offers.length > MAX_PAGE_SIZE
  )
    throw new HodlPublicResponseError();

  const offers = envelope.offers.map((offer) => normalizeOffer(offer, intent, nowMs));
  // Ambiguous duplicate identities are not safe candidates for later version-bound acceptance.
  const counts = new Map<string, number>();
  for (const offer of offers) if (offer) counts.set(offer.id, (counts.get(offer.id) ?? 0) + 1);
  return offers.filter(
    (offer): offer is HodlPublicOffer => offer !== null && counts.get(offer.id) === 1
  );
}

export function buildHodlOffersUrl(
  intent: MarketplaceIntent,
  options: { limit?: number; offset?: number; amountCents?: number } = {}
): string {
  const { limit = MAX_PAGE_SIZE, offset = 0, amountCents } = options;
  if (
    (intent !== 'buy' && intent !== 'sell') ||
    !integer(limit, 1, MAX_PAGE_SIZE) ||
    !integer(offset, 0, 10_000) ||
    (amountCents !== undefined && !integer(amountCents, 1, Number.MAX_SAFE_INTEGER))
  )
    throw new RangeError('Invalid public marketplace search.');

  const url = new URL('/api/v1/offers', ORIGIN);
  url.searchParams.set('pagination[limit]', String(limit));
  url.searchParams.set('pagination[offset]', String(offset));
  url.searchParams.set('filters[asset_code]', 'BTC');
  url.searchParams.set('filters[currency_code]', 'EUR');
  url.searchParams.set('filters[side]', intent === 'buy' ? 'sell' : 'buy');
  url.searchParams.set('filters[payment_method_id]', '9081');
  url.searchParams.set('filters[only_working_now]', 'true');
  if (amountCents !== undefined) {
    const cents = BigInt(amountCents);
    url.searchParams.set(
      'filters[amount]',
      `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
    );
  }
  return url.href;
}
