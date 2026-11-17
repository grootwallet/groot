const base = '/api/marketplace/localcoinswap';
const maxBytes = 512 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ProviderMode = 'fixture' | 'public' | 'account';
export type ProviderIntent = 'buy' | 'sell';
export type ProviderStage = 'live' | 'past';
export type Capabilities = {
  mode: ProviderMode;
  authenticated: boolean;
  tradeActions: boolean;
  btcExecution: false;
};
export type ProviderPage<T> = { items: T[]; nextOffset: number | null; total: number };
export type ProviderOffer = {
  id: string;
  intent: ProviderIntent;
  country: string | null;
  currency: 'EUR';
  paymentMethod: 'sepa_instant';
  pricePerBtcCents: number;
  exactPricePerBtc: { units: string; scale: number };
  minFiatCents: number;
  maxFiatCents: number;
  maker: string;
  terms: string | null;
  active: boolean;
  observedAtMs: number;
};
export type ProviderTrade = {
  id: string;
  status: string;
  buyer: string;
  seller: string;
  fiatCents: number;
  bitcoinSats: number;
  createdAtMs: number | null;
  expiresAtMs: number | null;
};
const transactionTypes = [
  'DEPOSIT',
  'WITHDRAW',
  'ESCROW',
  'ESCROW_RELEASE',
  'ESCROW_REFUND',
  'ESCROW_FEE'
] as const;
export type ProviderTransactionType = (typeof transactionTypes)[number];
export type ProviderTransaction = {
  id: number;
  txid: string | null;
  type: ProviderTransactionType;
  sats: number | null;
  confirmed: boolean | null;
  firstSeenAtMs: number | null;
  confirmedAtMs: number | null;
};
export type ProviderMessage = {
  id: number;
  sender: string;
  content: string | null;
  createdAtMs: number | null;
  hasAttachment: boolean;
};
export type ProviderLatestMessages = ProviderPage<ProviderMessage> & {
  nextOffset: null;
  offset: number;
};
export type ProviderAction =
  | { action: 'mark_paid' | 'withdraw_dispute' | 'cancel_unfunded'; expectedStatus: string }
  | { action: 'open_dispute'; expectedStatus: string; description: string };
export type ProviderOperation = {
  status: 'pending' | 'succeeded' | 'rejected' | 'unknown';
  data?: unknown;
  error?: { code: string };
};

type Options = { token?: string; signal?: AbortSignal };
type WriteOptions = Options & { key: string };
type Check<T> = (value: unknown) => value is T;

export class ProviderApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number
  ) {
    super(code);
    this.name = 'ProviderApiError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value);
}

function display(value: unknown, max = 250): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

const capabilities: Check<Capabilities> = (value): value is Capabilities =>
  record(value) &&
  (value.mode === 'fixture' || value.mode === 'public' || value.mode === 'account') &&
  typeof value.authenticated === 'boolean' &&
  typeof value.tradeActions === 'boolean' &&
  value.btcExecution === false &&
  (!value.tradeActions || value.authenticated);

const offer: Check<ProviderOffer> = (value): value is ProviderOffer =>
  record(value) &&
  identifier(value.id) &&
  (value.intent === 'buy' || value.intent === 'sell') &&
  (value.country === null ||
    (typeof value.country === 'string' && /^[A-Z]{2}$/.test(value.country))) &&
  value.currency === 'EUR' &&
  value.paymentMethod === 'sepa_instant' &&
  natural(value.pricePerBtcCents) &&
  value.pricePerBtcCents > 0 &&
  record(value.exactPricePerBtc) &&
  typeof value.exactPricePerBtc.units === 'string' &&
  /^[1-9][0-9]{0,35}$/.test(value.exactPricePerBtc.units) &&
  natural(value.exactPricePerBtc.scale) &&
  value.exactPricePerBtc.scale <= 18 &&
  natural(value.minFiatCents) &&
  natural(value.maxFiatCents) &&
  value.minFiatCents <= value.maxFiatCents &&
  display(value.maker) &&
  (value.terms === null || typeof value.terms === 'string') &&
  typeof value.active === 'boolean' &&
  natural(value.observedAtMs);

const trade: Check<ProviderTrade> = (value): value is ProviderTrade =>
  record(value) &&
  identifier(value.id) &&
  display(value.status, 40) &&
  display(value.buyer) &&
  display(value.seller) &&
  natural(value.fiatCents) &&
  natural(value.bitcoinSats) &&
  (value.createdAtMs === null || natural(value.createdAtMs)) &&
  (value.expiresAtMs === null || natural(value.expiresAtMs));

const message: Check<ProviderMessage> = (value): value is ProviderMessage =>
  record(value) &&
  natural(value.id) &&
  value.id > 0 &&
  display(value.sender) &&
  (value.content === null ||
    (typeof value.content === 'string' && value.content.length <= 1_000)) &&
  (value.createdAtMs === null || natural(value.createdAtMs)) &&
  typeof value.hasAttachment === 'boolean';

const tradeStatus: Check<{ id: string; status: string }> = (
  value
): value is { id: string; status: string } =>
  record(value) && identifier(value.id) && display(value.status, 40);

const transaction: Check<ProviderTransaction> = (value): value is ProviderTransaction =>
  record(value) &&
  natural(value.id) &&
  value.id > 0 &&
  (value.txid === null || (typeof value.txid === 'string' && /^[0-9a-f]{64}$/.test(value.txid))) &&
  transactionTypes.some((type) => type === value.type) &&
  (value.sats === null ||
    (typeof value.sats === 'number' &&
      Number.isSafeInteger(value.sats) &&
      Math.abs(value.sats) <= 2_100_000_000_000_000)) &&
  (value.confirmed === null || typeof value.confirmed === 'boolean') &&
  (value.firstSeenAtMs === null || natural(value.firstSeenAtMs)) &&
  (value.confirmedAtMs === null || natural(value.confirmedAtMs));

const operation: Check<ProviderOperation> = (value): value is ProviderOperation =>
  record(value) &&
  (value.status === 'pending' ||
    value.status === 'succeeded' ||
    value.status === 'rejected' ||
    value.status === 'unknown') &&
  (value.error === undefined || (record(value.error) && display(value.error.code, 50)));

function page<T>(check: Check<T>): Check<ProviderPage<T>> {
  return (value): value is ProviderPage<T> =>
    record(value) &&
    Array.isArray(value.items) &&
    value.items.length <= 100 &&
    value.items.every(check) &&
    (value.nextOffset === null || natural(value.nextOffset)) &&
    natural(value.total);
}

const messagePage = page(message);
const latestMessagePage: Check<ProviderLatestMessages> = (value): value is ProviderLatestMessages =>
  record(value) &&
  messagePage(value) &&
  value.nextOffset === null &&
  'offset' in value &&
  natural(value.offset) &&
  value.offset <= 10_000 &&
  value.offset + value.items.length === value.total;

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.startsWith('application/json') || !response.body)
    throw new ProviderApiError('invalid_response');
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new ProviderApiError('invalid_response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  let done = false;
  try {
    while (!done) {
      const part = await reader.read();
      done = part.done;
      if (part.value) {
        bytes += part.value.byteLength;
        if (bytes > maxBytes) throw new ProviderApiError('invalid_response');
        body += decoder.decode(part.value, { stream: true });
      }
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    if (!done) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function request<T>(
  path: string,
  check: Check<T>,
  options: Options,
  mutation?: { key: string; body: object }
): Promise<T> {
  const deadline = AbortSignal.timeout(12_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  try {
    const response = await fetch(`${base}${path}`, {
      method: mutation ? 'POST' : 'GET',
      signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        'X-Groot-LocalCoinSwap': '1',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(mutation ? { 'Content-Type': 'application/json', 'Idempotency-Key': mutation.key } : {})
      },
      ...(mutation ? { body: JSON.stringify(mutation.body) } : {})
    });
    const result = await readJson(response);
    if (!record(result) || result.apiVersion !== 1) throw new Error('Invalid API envelope.');
    if (!response.ok) {
      const error = result.error;
      if (!record(error) || !display(error.code, 50) || typeof error.retryable !== 'boolean')
        throw new Error('Invalid API error.');
      throw new ProviderApiError(
        error.code,
        error.retryable,
        natural(error.retryAfterSeconds) ? error.retryAfterSeconds : undefined
      );
    }
    if (!check(result.data)) throw new Error('Invalid API response.');
    return result.data;
  } catch (error) {
    if (error instanceof ProviderApiError && error.code !== 'invalid_response') throw error;
    if (mutation) throw new ProviderApiError('operation_unknown');
    if (signal.aborted || error instanceof TypeError)
      throw new ProviderApiError('provider_unavailable', true);
    throw new ProviderApiError('invalid_response');
  }
}

function query(values: Record<string, string | number | undefined>) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) parameters.set(key, String(value));
  return `?${parameters}`;
}

function idPath(id: string) {
  if (!identifier(id)) throw new ProviderApiError('invalid_request');
  return id;
}

export const localCoinSwapClient = {
  capabilities: (options: Options = {}) => request('/capabilities', capabilities, options),
  offers: (
    filter: {
      intent: ProviderIntent;
      amountCents: number;
      country?: string;
      limit?: number;
      offset?: number;
    },
    options: Options = {}
  ) => request(`/offers${query(filter)}`, page(offer), options),
  offer: (id: string, options: Options = {}) => request(`/offers/${idPath(id)}`, offer, options),
  trades: (
    filter: { stage: ProviderStage; limit?: number; offset?: number },
    options: Options = {}
  ) => request(`/trades${query(filter)}`, page(trade), options),
  trade: (id: string, options: Options = {}) => request(`/trades/${idPath(id)}`, trade, options),
  transactions: (
    filter: { type?: ProviderTransactionType; limit?: number; offset?: number },
    options: Options = {}
  ) => request(`/transactions${query(filter)}`, page(transaction), options),
  messages: (id: string, filter: { limit?: number; offset?: number }, options: Options = {}) =>
    request(`/trades/${idPath(id)}/messages${query(filter)}`, messagePage, options),
  latestMessages: (id: string, limit: number, options: Options = {}) =>
    request(
      `/trades/${idPath(id)}/messages${query({ view: 'latest', limit })}`,
      latestMessagePage,
      options
    ),
  send: (id: string, content: string, options: WriteOptions) =>
    request(`/trades/${idPath(id)}/messages`, message, options, {
      key: options.key,
      body: { content }
    }),
  act: (id: string, body: ProviderAction, options: WriteOptions) =>
    request(`/trades/${idPath(id)}/actions`, tradeStatus, options, { key: options.key, body }),
  operation: (key: string, options: Options = {}) =>
    request(`/operations/${idPath(key)}`, operation, options)
};
