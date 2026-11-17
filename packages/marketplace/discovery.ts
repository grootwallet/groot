import { MARKET_LIMITS } from './core';
import { normalizeHodlOffers } from './hodlhodl';
import { normalizeLocalCoinSwapOffers } from './localcoinswap';
import type { MarketplaceIntent, MarketplaceProvider, PublicOffer } from './public-offer';

/** Public listing comparison only. There are no executable quotes, fees or wallet operations. */
export type DiscoveryRequest = Readonly<{
  intent: MarketplaceIntent;
  amountCents: number;
}>;

export type DiscoveryOffer = Readonly<{
  offer: PublicOffer;
  /** Public requirements never establish account, country or provider acceptance eligibility. */
  eligibility: 'unknown' | 'public_requirements_met';
  /** Advertised-price indication before unknown platform, mining and banking costs. */
  grossEstimateSats: number;
  additionalOfferCount: number;
}>;

export type PublicOfferSnapshot = Readonly<{
  provider: MarketplaceProvider;
  intent: MarketplaceIntent;
  amountCents: number;
  receivedAtMs: number;
  expiresAtMs: number;
  offers: readonly DiscoveryOffer[];
  additionalOfferCount: number;
}>;

export type DiscoveryErrorCode = 'unavailable' | 'rate_limited' | 'invalid_response' | 'aborted';

export class DiscoveryError extends Error {
  constructor(
    public readonly code: DiscoveryErrorCode,
    public readonly retryAtMs?: number
  ) {
    super(code);
    this.name = 'DiscoveryError';
  }
}

const SNAPSHOT_TTL_MS = 60_000;
const MAX_RESPONSE_BYTES = 512 * 1_024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;

function validTime(value: number): boolean {
  return (
    Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER - SNAPSHOT_TTL_MS
  );
}

function validateRequest(request: DiscoveryRequest): void {
  if (
    (request.intent !== 'buy' && request.intent !== 'sell') ||
    !Number.isSafeInteger(request.amountCents) ||
    request.amountCents < MARKET_LIMITS.minCents ||
    request.amountCents > MARKET_LIMITS.maxCents
  )
    throw new RangeError('Invalid public marketplace search.');
}

function exactPrice(offer: PublicOffer): { units: bigint; scale: bigint } | null {
  const price = offer.exactPricePerBtc;
  if (price) {
    if (
      !/^[1-9][0-9]{0,35}$/.test(price.units) ||
      !Number.isSafeInteger(price.scale) ||
      price.scale < 0 ||
      price.scale > 18
    )
      return null;
    return { units: BigInt(price.units), scale: 10n ** BigInt(price.scale) };
  }
  return Number.isSafeInteger(offer.pricePerBtcCents) && offer.pricePerBtcCents > 0
    ? { units: BigInt(offer.pricePerBtcCents), scale: 100n }
    : null;
}

/** Newcomer policy: one listing per provider trader identity, ordered only by advertised price. */
export function comparePublicOffers(
  offers: readonly PublicOffer[],
  request: DiscoveryRequest
): DiscoveryOffer[] {
  validateRequest(request);
  const eligible = offers
    .filter(
      (offer) =>
        offer.intent === request.intent &&
        offer.currency === 'EUR' &&
        offer.paymentMethod === 'sepa_instant' &&
        request.amountCents >= offer.minFiatCents &&
        request.amountCents <= offer.maxFiatCents &&
        (offer.firstTradeLimitCents === null ||
          request.amountCents <= offer.firstTradeLimitCents) &&
        offer.requiresExperiencedUser !== true &&
        offer.requiresPhoneVerification !== true &&
        (offer.minimumFeedbackPercent == null || offer.minimumFeedbackPercent === 0)
    )
    .flatMap((offer) => {
      const price = exactPrice(offer);
      if (!price) return [];
      const numerator = BigInt(request.amountCents) * 1_000_000n * price.scale;
      const gross =
        request.intent === 'buy'
          ? numerator / price.units
          : (numerator + price.units - 1n) / price.units;
      if (gross <= 0n || gross > BigInt(Number.MAX_SAFE_INTEGER)) return [];
      return [{ offer, price, gross }];
    })
    .sort((a, b) => {
      const left = a.price.units * b.price.scale;
      const right = b.price.units * a.price.scale;
      const order = left < right ? -1 : left > right ? 1 : 0;
      return (
        (request.intent === 'buy' ? order : -order) ||
        (a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0)
      );
    });
  const grouped = new Map<string, DiscoveryOffer>();
  for (const { offer, gross } of eligible) {
    const traderId = `${offer.provider}:${offer.counterparty.id ?? offer.counterparty.alias}`;
    const previous = grouped.get(traderId);
    if (previous) {
      grouped.set(traderId, {
        ...previous,
        additionalOfferCount: previous.additionalOfferCount + 1
      });
      continue;
    }
    grouped.set(traderId, {
      offer,
      eligibility: offer.requiresExperiencedUser === null ? 'unknown' : 'public_requirements_met',
      grossEstimateSats: Number(gross),
      additionalOfferCount: 0
    });
  }
  return [...grouped.values()];
}

/** Future timestamps and the exact expiry boundary fail closed; no automatic refresh follows. */
export function isPublicOfferSnapshotFresh(snapshot: PublicOfferSnapshot, nowMs: number): boolean {
  return (
    validTime(snapshot.receivedAtMs) &&
    validTime(nowMs) &&
    snapshot.expiresAtMs === snapshot.receivedAtMs + SNAPSHOT_TTL_MS &&
    nowMs >= snapshot.receivedAtMs &&
    nowMs < snapshot.expiresAtMs
  );
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (
    type !== 'application/json' ||
    (length !== null &&
      (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => {});
    throw new DiscoveryError('invalid_response');
  }
  const reader = response.body.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new DiscoveryError('invalid_response');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

function retryAt(response: Response, nowMs: number): number {
  const retry = response.headers.get('retry-after');
  let delay = 30_000;
  if (retry && /^[0-9]{1,10}$/.test(retry)) delay = Number(retry) * 1_000;
  else if (retry && /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retry)) {
    const parsed = Date.parse(retry);
    if (Number.isFinite(parsed)) delay = parsed - nowMs;
  }
  return nowMs + Math.max(0, Math.min(delay, MAX_RETRY_DELAY_MS, Number.MAX_SAFE_INTEGER - nowMs));
}

export type DiscoveryClientOptions = Readonly<{
  /** Product configuration; never an automatic fallback or an account-derived setting. */
  provider?: MarketplaceProvider;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  signal?: AbortSignal;
  /** May shorten the fixed production bound for deterministic timeout tests. */
  timeoutMs?: number;
}>;

/** Only an explicit caller initiates this same-origin request. No retries, polling or stored consent. */
export async function loadPublicOffers(
  request: DiscoveryRequest,
  options: DiscoveryClientOptions = {}
): Promise<PublicOfferSnapshot> {
  validateRequest(request);
  const provider = options.provider ?? 'localcoinswap';
  if (provider !== 'localcoinswap' && provider !== 'hodlhodl')
    throw new RangeError('Invalid public marketplace provider.');
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > REQUEST_TIMEOUT_MS)
    throw new RangeError('Invalid public marketplace timeout.');
  if (options.signal?.aborted) throw new DiscoveryError('aborted');
  const controller = new AbortController();
  let rejectInterruption: (error: DiscoveryError) => void = () => {};
  const interruption = new Promise<never>((_, reject) => {
    rejectInterruption = reject;
  });
  const interrupt = (code: 'aborted' | 'unavailable') => {
    rejectInterruption(new DiscoveryError(code));
    controller.abort();
  };
  const onAbort = () => interrupt('aborted');
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => interrupt('unavailable'), timeoutMs);
  let response: Response | undefined;
  try {
    const operation = async (): Promise<PublicOfferSnapshot> => {
      response = await (options.fetch ?? globalThis.fetch)(
        `/__groot_marketplace/offers?intent=${request.intent}&amountCents=${request.amountCents}`,
        {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          headers: { Accept: 'application/json', 'X-Groot-Marketplace-Request': '1' },
          signal: controller.signal
        }
      );
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw new DiscoveryError('aborted');
      }
      if (response.status === 429) {
        const receivedAtMs = now();
        if (!validTime(receivedAtMs)) throw new DiscoveryError('invalid_response');
        throw new DiscoveryError('rate_limited', retryAt(response, receivedAtMs));
      }
      if (!response.ok) throw new DiscoveryError('unavailable');
      const payload = await readBoundedJson(response, controller.signal);
      if (controller.signal.aborted) throw new DiscoveryError('aborted');
      const receivedAtMs = now();
      if (!validTime(receivedAtMs)) throw new DiscoveryError('invalid_response');
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        !('provider' in payload) ||
        payload.provider !== provider ||
        !('payload' in payload)
      )
        throw new DiscoveryError('invalid_response');
      const normalized =
        provider === 'localcoinswap'
          ? normalizeLocalCoinSwapOffers(payload.payload, request.intent, receivedAtMs)
          : normalizeHodlOffers(payload.payload, request.intent, receivedAtMs);
      const offers = comparePublicOffers(normalized, request);
      return {
        provider,
        intent: request.intent,
        amountCents: request.amountCents,
        receivedAtMs,
        expiresAtMs: receivedAtMs + SNAPSHOT_TTL_MS,
        offers,
        additionalOfferCount: offers.reduce((total, offer) => total + offer.additionalOfferCount, 0)
      };
    };
    return await Promise.race([operation(), interruption]);
  } catch (error) {
    if (error instanceof DiscoveryError) throw error;
    if (error instanceof SyntaxError || error instanceof TypeError) {
      // Failed transport is unavailable; malformed JSON/UTF-8 from an established response is invalid.
      throw new DiscoveryError(response ? 'invalid_response' : 'unavailable');
    }
    throw new DiscoveryError(response ? 'invalid_response' : 'unavailable');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
    if (response && !response.body?.locked) void response.body?.cancel().catch(() => {});
  }
}
