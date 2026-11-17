import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendRequest, decodeWorkspace, type PaymentInstructions } from './backend-client';

const accountId = '10000000-0000-4000-8000-000000000001';
const peerId = '10000000-0000-4000-8000-000000000002';
const tradeId = '40000000-0000-4000-8000-000000000001';
const at = 1_799_999_000_000;
function workspace() {
  const trade = {
    id: tradeId,
    mode: 'sandbox',
    buyerId: accountId,
    sellerId: peerId,
    role: 'buyer',
    state: 'escrow_pending',
    revision: 0,
    createdAt: at,
    updatedAt: at,
    quote: {
      id: '30000000-0000-4000-8000-000000000001',
      intent: 'buy',
      offerId: '20000000-0000-4000-8000-000000000001',
      alias: 'River · simulated',
      fiatCents: 15000,
      grossSats: 166666,
      platformFeeSats: 1667,
      fundingFeeSats: 500,
      releaseFeeSats: 500,
      bitcoinSats: 164499,
      createdAt: at,
      expiresAt: at + 60000,
      mode: 'sandbox'
    }
  };
  return {
    session: {
      account: { id: accountId, username: 'market_tester', createdAt: at },
      csrfToken: 'c'.repeat(43),
      expiresAt: at + 43_200_000
    },
    trades: [trade],
    selected: {
      trade: structuredClone(trade),
      counterparty: { alias: 'River · simulated', isSystem: true },
      paymentInstructions: null as PaymentInstructions | null,
      messages: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          tradeId,
          actorId: accountId,
          text: 'Only a test message.',
          createdAt: at
        }
      ],
      events: [
        {
          id: '60000000-0000-4000-8000-000000000001',
          kind: 'trade_started',
          revision: 0,
          createdAt: at
        }
      ]
    }
  };
}
afterEach(() => vi.unstubAllGlobals());
function invalid(value: unknown) {
  expect(() => decodeWorkspace(value)).toThrow(
    expect.objectContaining({ code: 'invalid_response' })
  );
}
describe('atomic private workspace contract', () => {
  it('accepts anonymous, signed-in empty, and complete selected workspaces', () => {
    expect(decodeWorkspace({ session: { account: null }, trades: [], selected: null })).toEqual({
      session: { account: null },
      trades: [],
      selected: null
    });
    const value = workspace();
    expect(decodeWorkspace(value)).toEqual(value);
    expect(decodeWorkspace({ ...value, trades: [], selected: null }).selected).toBeNull();
    // Another tab's obsolete selected ID may yield own trades with no selection.
    expect(decodeWorkspace({ ...value, selected: null }).trades).toEqual(value.trades);
  });
  it('rejects anonymous private records, foreign trades and incorrect viewer roles', () => {
    const value = workspace();
    invalid({ ...value, session: { account: null } });
    invalid({ ...value, session: { account: null }, trades: [] });
    value.trades[0].role = 'seller';
    invalid(value);
    value.trades[0].role = 'buyer';
    value.session.account.id = '10000000-0000-4000-8000-000000000003';
    invalid(value);
  });
  it('rejects stale selection, mixed snapshots, duplicate records and reordered trade lists', () => {
    const stale = workspace();
    stale.selected.trade.revision++;
    invalid(stale);
    const price = workspace();
    price.selected.trade.quote.fiatCents++;
    invalid(price);
    const missing = workspace();
    missing.trades = [];
    invalid(missing);
    const duplicates = workspace();
    duplicates.trades.push(structuredClone(duplicates.trades[0]));
    invalid(duplicates);
    const order = workspace();
    order.trades.push({ ...order.trades[0], id: peerId, createdAt: at + 1, updatedAt: at + 1 });
    invalid(order);
  });
  it('rejects messages from another trade or actor and duplicate message IDs', () => {
    const foreign = workspace();
    foreign.selected.messages[0].tradeId = peerId;
    invalid(foreign);
    const actor = workspace();
    actor.selected.messages[0].actorId = '10000000-0000-4000-8000-000000000003';
    invalid(actor);
    const duplicates = workspace();
    duplicates.selected.messages.push(structuredClone(duplicates.selected.messages[0]));
    invalid(duplicates);
  });
  it('rejects an ambiguous or malformed counterparty classification', () => {
    const value = workspace();
    invalid({ ...value, selected: { ...value.selected, counterparty: undefined } });
    invalid({
      ...value,
      selected: { ...value.selected, counterparty: { alias: 'River', isSystem: 'true' } }
    });
    invalid({
      ...value,
      selected: { ...value.selected, counterparty: { alias: '\n', isSystem: false } }
    });
  });
  it('accepts an older workspace without the optional practice details field', () => {
    const value = workspace();
    const { paymentInstructions: _unused, ...selected } = value.selected;
    expect(decodeWorkspace({ ...value, selected })).toEqual(value);
  });
  it('reveals only validated trade-bound practice details to the buyer after escrow', () => {
    const value = workspace();
    const instructions = {
      recipient: 'TEST SELLER01',
      iban: 'DE00 0000 0000 0000 1234 56',
      reference: 'TEST-000000000001'
    };
    value.selected.paymentInstructions = instructions;
    invalid(value);
    value.trades[0].state = value.selected.trade.state = 'awaiting_payment';
    value.trades[0].revision = value.selected.trade.revision = 1;
    value.selected.events.push({
      id: '60000000-0000-4000-8000-000000000002',
      kind: 'sandbox_confirm_escrow',
      revision: 1,
      createdAt: at
    });
    expect(decodeWorkspace(value).selected?.paymentInstructions).toEqual(instructions);
    value.selected.paymentInstructions = { ...instructions, iban: 'DE89 3704 0044 0532 0130 00' };
    invalid(value);
    value.selected.paymentInstructions = { ...instructions, reference: 'TEST-000000000002' };
    invalid(value);
  });
  it.each([
    '/v1/sandbox/quotes',
    '/v1/sandbox/trades',
    `/v1/sandbox/trades/${tradeId}/complete`,
    `/v1/trades/${tradeId}/payment-instructions`
  ])('permits only a POST to the exact mutation endpoint %s', async (path) => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ apiVersion: 1, mode: 'sandbox', data: null }), {
          headers: { 'Content-Type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);
    await expect(backendRequest(path, (value) => value)).rejects.toMatchObject({
      code: 'invalid_request'
    });
    await expect(
      backendRequest(`${path}?extra=1`, (value) => value, { method: 'POST' })
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetch).not.toHaveBeenCalled();
    await expect(backendRequest(path, (value) => value, { method: 'POST' })).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('requires a complete ordered revision window ending at the selected trade revision', () => {
    const missing = workspace();
    missing.selected.events = [];
    invalid(missing);
    const stale = workspace();
    stale.selected.events[0].revision++;
    invalid(stale);
    const duplicate = workspace();
    duplicate.selected.events.push(structuredClone(duplicate.selected.events[0]));
    invalid(duplicate);
    const value = workspace();
    value.trades[0].revision = value.selected.trade.revision = 120;
    value.selected.events = Array.from({ length: 100 }, (_, index) => ({
      id: `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      kind: 'sandbox_confirm_escrow',
      revision: index + 21,
      createdAt: at
    }));
    expect(decodeWorkspace(value).selected?.events).toHaveLength(100);
    value.selected.events[30].revision++;
    invalid(value);
  });
  it.each(['/v1/workspace', `/v1/workspace?tradeId=${tradeId}`])(
    'accepts only a bounded canonical workspace path: %s',
    async (path) => {
      const value = workspace();
      const fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ apiVersion: 1, mode: 'sandbox', data: value }), {
            headers: { 'Content-Type': 'application/json' }
          })
      );
      vi.stubGlobal('fetch', fetch);
      expect(await backendRequest(path, decodeWorkspace)).toEqual(value);
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]).toBeDefined();
    }
  );
  it('finishes successful reads without aborting them and removes the caller abort listener', async () => {
    const caller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path: RequestInfo | URL, options: RequestInit) => {
        requestSignal = options.signal as AbortSignal;
        return new Response(JSON.stringify({ apiVersion: 1, mode: 'sandbox', data: workspace() }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    await backendRequest('/v1/workspace', decodeWorkspace, { signal: caller.signal });
    expect(requestSignal?.aborted).toBe(false);
    caller.abort();
    expect(requestSignal?.aborted).toBe(false);
  });
  it.each([
    '/v1/workspace?tradeId=foreign',
    `/v1/workspace?tradeId=${tradeId}&tradeId=${tradeId}`,
    '/v1/workspace?csrf=secret',
    `/v1/workspace?tradeId=${tradeId}#fragment`
  ])('rejects unexpected workspace selection syntax before network I/O: %s', async (path) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(backendRequest(path, decodeWorkspace)).rejects.toMatchObject({
      code: 'invalid_request'
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
