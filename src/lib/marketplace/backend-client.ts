/** Same-origin client for the separate marketplace's explicitly sandbox-only API. */
import { sandboxPaymentReference } from './trade-presentation';

export type Account = { id: string; username: string; createdAt: number };
export type Session = { account: Account | null; csrfToken?: string; expiresAt?: number };
export type Offer = {
  id: string;
  revision: number;
  intent: 'buy' | 'sell';
  alias: string;
  ownerId: string;
  pricePerBtcCents: number;
  minCents: number;
  maxCents: number;
  synthetic: true;
};
export type Quote = {
  id: string;
  intent: 'buy' | 'sell';
  offerId: string;
  alias: string;
  fiatCents: number;
  grossSats: number;
  platformFeeSats: number;
  fundingFeeSats: number;
  releaseFeeSats: number;
  bitcoinSats: number;
  createdAt: number;
  expiresAt: number;
  mode: 'sandbox';
};
export const TRADE_STATES = [
  'escrow_pending',
  'awaiting_payment',
  'payment_sent',
  'release_pending',
  'completed',
  'cancelled',
  'refund_pending',
  'refunded',
  'disputed'
] as const;
export type Trade = {
  id: string;
  mode: 'sandbox';
  buyerId: string;
  sellerId: string;
  role: 'buyer' | 'seller';
  state: (typeof TRADE_STATES)[number];
  revision: number;
  quote: Quote;
  createdAt: number;
  updatedAt: number;
};
export type Message = {
  id: string;
  tradeId?: string;
  text: string;
  actorId?: string;
  createdAt: number;
};
export type TradeEvent = { id: string; kind: string; revision: number; createdAt: number };
export type Counterparty = { alias: string; isSystem: boolean };
export type PaymentInstructions = { recipient: string; iban: string; reference: string };
export const PRACTICE_IBAN = /^DE00 0000 0000 0000 [0-9]{4} [0-9]{2}$/;
export const PRACTICE_ACCOUNT_HOLDER = /^TEST [A-Z0-9]{2,24}$/;
export type Workspace = {
  session: Session;
  trades: Trade[];
  selected: {
    trade: Trade;
    counterparty: Counterparty;
    messages: Message[];
    events: TradeEvent[];
    paymentInstructions: PaymentInstructions | null;
  } | null;
};
export class BackendError extends Error {
  constructor(
    public code: string,
    public ambiguous = false
  ) {
    super(code);
  }
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// A full valid history can contain 100 × 2,000 three-byte UTF-8 characters,
// plus message metadata. Bound the encoded response without truncating history.
const MAX_RESPONSE_BYTES = 1024 * 1024;
const CODES = new Set([
  'invalid_request',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'quote_expired',
  'invalid_transition',
  'unavailable',
  'rate_limited'
]);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
function text(value: unknown, max = 160): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function invalid(): never {
  throw new BackendError('invalid_response', true);
}
export function decodeSession(value: unknown): Session {
  if (!record(value)) return invalid();
  if (value.account === null) return { account: null };
  if (
    !record(value.account) ||
    !uuid(value.account.id) ||
    typeof value.account.username !== 'string' ||
    !/^[a-z][a-z0-9_]{2,31}$/.test(value.account.username) ||
    !integer(value.account.createdAt) ||
    typeof value.csrfToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken) ||
    !integer(value.expiresAt) ||
    value.expiresAt <= value.account.createdAt
  )
    return invalid();
  return value as unknown as Session;
}
export function decodeQuote(value: unknown): Quote {
  if (
    !record(value) ||
    value.mode !== 'sandbox' ||
    !uuid(value.id) ||
    !uuid(value.offerId) ||
    !text(value.alias) ||
    !['buy', 'sell'].includes(String(value.intent)) ||
    ![
      'fiatCents',
      'grossSats',
      'platformFeeSats',
      'fundingFeeSats',
      'releaseFeeSats',
      'bitcoinSats',
      'createdAt',
      'expiresAt'
    ].every((k) => integer(value[k])) ||
    Number(value.fiatCents) < 5000 ||
    Number(value.fiatCents) > 25000 ||
    Number(value.bitcoinSats) <= 0 ||
    Number(value.grossSats) <= 0 ||
    Number(value.expiresAt) !== Number(value.createdAt) + 60000
  )
    return invalid();
  const gross = BigInt(Number(value.grossSats));
  if (
    BigInt(Number(value.platformFeeSats)) !== (gross + 99n) / 100n ||
    value.fundingFeeSats !== 500 ||
    value.releaseFeeSats !== 500 ||
    BigInt(Number(value.bitcoinSats)) !==
      (value.intent === 'buy'
        ? gross - BigInt(Number(value.platformFeeSats)) - 500n
        : gross + BigInt(Number(value.platformFeeSats)) + 500n)
  )
    return invalid();
  return value as unknown as Quote;
}
export function decodeTrade(value: unknown): Trade {
  if (
    !record(value) ||
    value.mode !== 'sandbox' ||
    !uuid(value.id) ||
    !uuid(value.buyerId) ||
    !uuid(value.sellerId) ||
    value.buyerId === value.sellerId ||
    !['buyer', 'seller'].includes(String(value.role)) ||
    !(TRADE_STATES as readonly unknown[]).includes(value.state) ||
    !integer(value.revision) ||
    !integer(value.createdAt) ||
    !integer(value.updatedAt) ||
    value.updatedAt < value.createdAt
  )
    return invalid();
  decodeQuote(value.quote);
  return value as unknown as Trade;
}
export function decodeOffers(value: unknown): Offer[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every(
      (o) =>
        record(o) &&
        uuid(o.id) &&
        text(o.alias) &&
        uuid(o.ownerId) &&
        o.synthetic === true &&
        integer(o.revision) &&
        Number(o.revision) >= 1 &&
        ['buy', 'sell'].includes(String(o.intent)) &&
        integer(o.pricePerBtcCents) &&
        Number(o.pricePerBtcCents) > 0 &&
        Number(o.pricePerBtcCents) <= 1000000000 &&
        integer(o.minCents) &&
        integer(o.maxCents) &&
        Number(o.minCents) >= 5000 &&
        Number(o.maxCents) <= 25000 &&
        Number(o.minCents) <= Number(o.maxCents)
    )
  )
    return invalid();
  return value;
}
export function decodeTrades(value: unknown): Trade[] {
  if (!Array.isArray(value) || value.length > 100) return invalid();
  return value.map(decodeTrade);
}
export function decodeMessages(value: unknown): Message[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every(
      (m) =>
        record(m) &&
        uuid(m.id) &&
        typeof m.text === 'string' &&
        m.text.trim().length > 0 &&
        m.text.length <= 2000 &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(m.text) &&
        integer(m.createdAt)
    )
  )
    return invalid();
  return value;
}
export function decodeTradeMessages(
  value: unknown,
  trade: Pick<Trade, 'id' | 'buyerId' | 'sellerId'>
): Message[] {
  const messages = decodeMessages(value);
  if (
    new Set(messages.map((message) => message.id)).size !== messages.length ||
    messages.some(
      (message) =>
        message.tradeId !== trade.id ||
        (message.actorId !== trade.buyerId && message.actorId !== trade.sellerId)
    )
  )
    return invalid();
  return messages;
}
export function decodeEvents(value: unknown): TradeEvent[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every(
      (e) =>
        record(e) && uuid(e.id) && text(e.kind, 80) && integer(e.revision) && integer(e.createdAt)
    )
  )
    return invalid();
  return value;
}
export function decodePaymentInstructions(value: unknown, tradeId: string): PaymentInstructions {
  if (
    !record(value) ||
    typeof value.recipient !== 'string' ||
    !PRACTICE_ACCOUNT_HOLDER.test(value.recipient) ||
    typeof value.iban !== 'string' ||
    !PRACTICE_IBAN.test(value.iban) ||
    value.reference !== sandboxPaymentReference(tradeId)
  )
    return invalid();
  return { recipient: value.recipient, iban: value.iban, reference: value.reference };
}
/** Validate identity, selection and history together before publishing private UI state. */
export function decodeWorkspace(value: unknown): Workspace {
  if (!record(value)) return invalid();
  const session = decodeSession(value.session);
  const trades = decodeTrades(value.trades);
  if (!session.account) {
    if (trades.length || value.selected !== null) return invalid();
    return { session, trades, selected: null };
  }
  const accountId = session.account.id;
  if (
    new Set(trades.map((trade) => trade.id)).size !== trades.length ||
    trades.some(
      (trade, index) =>
        (trade.role === 'buyer' ? trade.buyerId : trade.sellerId) !== accountId ||
        (index > 0 && trade.createdAt > trades[index - 1].createdAt)
    )
  )
    return invalid();
  if (value.selected === null) return { session, trades, selected: null };
  if (!record(value.selected)) return invalid();
  const counterparty = value.selected.counterparty;
  if (
    !record(counterparty) ||
    !text(counterparty.alias) ||
    typeof counterparty.isSystem !== 'boolean'
  )
    return invalid();
  const selected = decodeTrade(value.selected.trade);
  const listed = trades.find((trade) => trade.id === selected.id);
  // Compare known fields, independent of JSON property ordering or ignored extensions.
  if (
    !listed ||
    !(
      [
        'id',
        'mode',
        'buyerId',
        'sellerId',
        'role',
        'state',
        'revision',
        'createdAt',
        'updatedAt'
      ] as const
    ).every((key) => listed[key] === selected[key]) ||
    !(
      [
        'id',
        'intent',
        'offerId',
        'alias',
        'fiatCents',
        'grossSats',
        'platformFeeSats',
        'fundingFeeSats',
        'releaseFeeSats',
        'bitcoinSats',
        'createdAt',
        'expiresAt',
        'mode'
      ] as const
    ).every((key) => listed.quote[key as keyof Quote] === selected.quote[key as keyof Quote])
  )
    return invalid();
  const messages = decodeTradeMessages(value.selected.messages, selected);
  const events = decodeEvents(value.selected.events);
  if (
    new Set(events.map((event) => event.id)).size !== events.length ||
    !events.length ||
    events.at(-1)?.revision !== selected.revision ||
    events[0].revision !== Math.max(0, selected.revision - 99) ||
    events.some((event, index) => index > 0 && event.revision !== events[index - 1].revision + 1)
  )
    return invalid();
  const paymentInstructions =
    value.selected.paymentInstructions == null
      ? null
      : decodePaymentInstructions(value.selected.paymentInstructions, selected.id);
  if (
    paymentInstructions &&
    selected.role === 'buyer' &&
    (selected.state === 'escrow_pending' || selected.state === 'cancelled')
  )
    return invalid();
  return {
    session,
    trades,
    selected: {
      trade: selected,
      counterparty: { alias: counterparty.alias, isSystem: counterparty.isSystem },
      messages,
      events,
      paymentInstructions
    }
  };
}
export type Mutation = { path: string; body: unknown; key: string };
export function mutation(path: string, body: unknown): Mutation {
  return { path, body, key: crypto.randomUUID() };
}
export async function backendRequest<T>(
  path: string,
  decode: (value: unknown) => T,
  options: {
    method?: string;
    body?: unknown;
    csrf?: string;
    key?: string;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const id = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const method = options.method ?? 'GET';
  const guided =
    /^\/v1\/sandbox\/(quotes|trades)$/.test(path) ||
    new RegExp(`^/v1/sandbox/trades/${id}/complete$`, 'i').test(path);
  const bankDetails = new RegExp(`^/v1/trades/${id}/payment-instructions$`, 'i').test(path);
  const allowed =
    new RegExp(`^/v1/workspace\\?tradeId=${id}$`, 'i').test(path) ||
    /^\/v1\/(accounts|sessions|session|workspace|capabilities|offers|quotes|trades)$/.test(path) ||
    /^\/v1\/offers\?intent=(buy|sell)&amountCents=[0-9]{4,5}$/.test(path) ||
    new RegExp(`^/v1/trades/${id}(/(commands|messages|events))?$`, 'i').test(path) ||
    new RegExp(`^/v1/sandbox/trades/${id}/events$`, 'i').test(path);
  if (
    !(guided || bankDetails
      ? method === 'POST'
      : allowed && ['GET', 'POST', 'DELETE'].includes(method))
  )
    throw new BackendError('invalid_request');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, 10000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelBody = () => {
    void reader?.cancel().catch(() => {});
  };
  controller.signal.addEventListener('abort', cancelBody, { once: true });
  const operation = async () => {
    if (controller.signal.aborted) throw new BackendError('unavailable', true);
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.csrf ? { 'X-Groot-Marketplace-CSRF': options.csrf } : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {})
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => {});
      throw new BackendError('unavailable', true);
    }
    if (
      !response.body ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
    ) {
      void response.body?.cancel().catch(() => {});
      return invalid();
    }
    const declared = response.headers.get('content-length');
    if (
      declared !== null &&
      (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)
    ) {
      void response.body.cancel().catch(() => {});
      return invalid();
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > MAX_RESPONSE_BYTES) return invalid();
        chunks.push(part.value);
      }
    } finally {
      void reader.cancel().catch(() => {});
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const part of chunks) {
      data.set(part, offset);
      offset += part.length;
    }
    const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (
      controller.signal.aborted ||
      !record(envelope) ||
      envelope.apiVersion !== 1 ||
      envelope.mode !== 'sandbox'
    )
      return invalid();
    if (!response.ok) {
      const code =
        record(envelope.error) &&
        typeof envelope.error.code === 'string' &&
        CODES.has(envelope.error.code)
          ? envelope.error.code
          : 'unavailable';
      throw new BackendError(code, response.status >= 500);
    }
    return decode(envelope.data);
  };
  let interrupted: (() => void) | undefined;
  let completed = false;
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        interrupted = () => reject(new BackendError('unavailable', true));
        if (controller.signal.aborted) interrupted();
        else controller.signal.addEventListener('abort', interrupted, { once: true });
      })
    ]);
    completed = true;
    return result;
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError('unavailable', true);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    if (interrupted) controller.signal.removeEventListener('abort', interrupted);
    // A fully read, decoded response has no outstanding work to cancel. Abort
    // only failed/interrupted work; aborting success also discards browser
    // response diagnostics and marks a completed request as cancelled.
    if (!completed) controller.abort();
    controller.signal.removeEventListener('abort', cancelBody);
  }
}
