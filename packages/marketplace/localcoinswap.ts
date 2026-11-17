import type { MarketplaceIntent, PublicOffer } from './public-offer';

/** Public advertisements only: no account, exact fees, reservation or settlement authority. */
export type LocalCoinSwapPublicOffer = PublicOffer & Readonly<{ provider: 'localcoinswap' }>;

export class LocalCoinSwapPublicResponseError extends Error {
  readonly code = 'invalid_provider_response';

  constructor() {
    super('The marketplace provider returned an invalid public offer response.');
    this.name = 'LocalCoinSwapPublicResponseError';
  }
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_PAGE_SIZE = 100;
const MAX_LAST_SEEN_SECONDS = 30 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function alias(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 150 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

/** Decimal strings retain precision. No floats, exponent notation, sign or leading zeroes. */
function decimal(value: unknown): { units: bigint; scale: number } | null {
  if (typeof value !== 'string' || value.length > 55) return null;
  const match = /^(0|[1-9][0-9]{0,35})(?:\.([0-9]{1,18}))?$/.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  const units = BigInt(`${match[1]}${fraction}`);
  if (units.toString().length > 36) return null;
  return { units, scale: fraction.length };
}

/** Fiat bounds must represent exact cents, including the provider's ten trailing zeroes. */
function cents(value: unknown): number | null {
  const parsed = decimal(value);
  if (!parsed) return null;
  const denominator = 10n ** BigInt(parsed.scale);
  const numerator = parsed.units * 100n;
  if (numerator % denominator !== 0n) return null;
  const result = numerator / denominator;
  return result <= MAX_SAFE ? Number(result) : null;
}

function feedbackPercent(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,2})$/.test(value)) return NaN;
  const result = Number(value);
  return result <= 100 ? result : NaN;
}

export function buildLocalCoinSwapOfferUrl(id: string, slug: string): string {
  if (!uuid(id) || !/^[a-zA-Z0-9_-]{1,128}$/.test(slug))
    throw new RangeError('Invalid public marketplace offer identity.');
  return `https://localcoinswap.com/trade/${encodeURIComponent(slug)}/${id}`;
}

function normalizeOffer(
  candidate: unknown,
  intent: MarketplaceIntent,
  observedAtMs: number
): LocalCoinSwapPublicOffer | null {
  const offer = record(candidate);
  const crypto = record(offer?.coin_currency);
  const fiat = record(offer?.fiat_currency);
  const method = record(offer?.payment_method);
  const side = record(offer?.trading_type);
  const trader = record(offer?.created_by);
  if (
    !offer ||
    !uuid(offer.uuid) ||
    typeof offer.slug !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(offer.slug) ||
    crypto?.symbol !== 'BTC' ||
    crypto.slug !== 'BTC' ||
    crypto.is_crypto !== true ||
    crypto.token_standard !== null ||
    fiat?.symbol !== 'EUR' ||
    fiat.is_crypto !== false ||
    fiat.token_standard !== null ||
    method?.slug !== 'sepa-instant' ||
    side?.slug !== (intent === 'buy' ? 'sell' : 'buy') ||
    (offer.hidden !== undefined && offer.hidden !== false) ||
    (offer.enforced_sizes !== '' && offer.enforced_sizes !== null) ||
    !trader ||
    !uuid(trader.user_uuid) ||
    !alias(trader.username) ||
    trader.activity_status !== 'active' ||
    !integer(trader.last_seen, 0, Math.floor(observedAtMs / 1_000)) ||
    Math.floor(observedAtMs / 1_000) - trader.last_seen > MAX_LAST_SEEN_SECONDS
  )
    return null;

  const exactPrice = decimal(offer.price_formula_value);
  const min = cents(offer.min_trade_size);
  const max = cents(offer.max_trade_size);
  const minimumFeedback = feedbackPercent(offer.minimum_feedback);
  if (
    !exactPrice ||
    exactPrice.units <= 0n ||
    min === null ||
    min <= 0 ||
    max === null ||
    max < min ||
    Number.isNaN(minimumFeedback) ||
    (offer.sms_required != null && typeof offer.sms_required !== 'boolean') ||
    (trader.completed_trades != null && !integer(trader.completed_trades, 0))
  )
    return null;

  const priceDenominator = 10n ** BigInt(exactPrice.scale);
  const displayCents = (exactPrice.units * 100n + priceDenominator / 2n) / priceDenominator;
  if (displayCents <= 0n || displayCents > MAX_SAFE) return null;

  return {
    provider: 'localcoinswap',
    indicative: true,
    id: offer.uuid,
    intent,
    currency: 'EUR',
    paymentMethod: 'sepa_instant',
    pricePerBtcCents: Number(displayCents),
    exactPricePerBtc: { units: exactPrice.units.toString(), scale: exactPrice.scale },
    minFiatCents: min,
    maxFiatCents: max,
    firstTradeLimitCents: null,
    requiresExperiencedUser: null,
    requiresPhoneVerification: typeof offer.sms_required === 'boolean' ? offer.sms_required : null,
    minimumFeedbackPercent: minimumFeedback,
    // automatic_cancel_time is an initial response deadline, not the fiat payment window.
    paymentWindowMinutes: null,
    confirmations: null,
    // Search headlines are not authoritative trade terms. Offer review remains on the provider.
    terms: null,
    counterparty: {
      id: trader.user_uuid,
      alias: trader.username,
      completedTrades: (trader.completed_trades as number | null | undefined) ?? null,
      // LocalCoinSwap feedback_score is out of five stars, not a completion percentage.
      ratingBasisPoints: null,
      averagePaymentMinutes: null,
      averageReleaseMinutes: null
    },
    observedAtMs,
    url: buildLocalCoinSwapOfferUrl(offer.uuid, offer.slug)
  };
}

export function normalizeLocalCoinSwapOffers(
  payload: unknown,
  intent: MarketplaceIntent,
  observedAtMs: number
): LocalCoinSwapPublicOffer[] {
  const envelope = record(payload);
  if (
    (intent !== 'buy' && intent !== 'sell') ||
    !integer(observedAtMs, 0) ||
    !envelope ||
    !integer(envelope.count, 0) ||
    !Array.isArray(envelope.results) ||
    envelope.results.length > MAX_PAGE_SIZE ||
    envelope.count < envelope.results.length ||
    (envelope.limit !== undefined && !integer(envelope.limit, 1, MAX_PAGE_SIZE)) ||
    (envelope.offset !== undefined && !integer(envelope.offset, 0, 10_000))
  )
    throw new LocalCoinSwapPublicResponseError();

  const offers = envelope.results.map((offer) => normalizeOffer(offer, intent, observedAtMs));
  const counts = new Map<string, number>();
  for (const offer of offers) if (offer) counts.set(offer.id, (counts.get(offer.id) ?? 0) + 1);
  // Pagination URLs, provider counts and presentation HTML are never part of the public DTO.
  return offers.filter(
    (offer): offer is LocalCoinSwapPublicOffer => offer !== null && counts.get(offer.id) === 1
  );
}

export function buildLocalCoinSwapOffersUrl(
  intent: MarketplaceIntent,
  options: { limit?: number; offset?: number } = {}
): string {
  const { limit = MAX_PAGE_SIZE, offset = 0 } = options;
  if (
    (intent !== 'buy' && intent !== 'sell') ||
    !integer(limit, 1, MAX_PAGE_SIZE) ||
    !integer(offset, 0, 10_000)
  )
    throw new RangeError('Invalid public marketplace search.');
  const url = new URL('/api/v2/offers/search/', 'https://api.localcoinswap.com');
  url.searchParams.set('coin_currency', 'BTC');
  url.searchParams.set('fiat_currency', 'EUR');
  url.searchParams.set('trading_type', intent === 'buy' ? 'sell' : 'buy');
  url.searchParams.set('payment_method', 'sepa-instant');
  url.searchParams.set('last_seen', '30mins');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  // The documented public search has no amount filter. The caller filters integer cents locally.
  return url.href;
}
