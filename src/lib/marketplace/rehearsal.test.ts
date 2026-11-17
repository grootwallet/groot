import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTradeEvent, type Trade } from '../../../packages/marketplace/core';
import { createPreviewMarketplace } from './index';
import { prepareRehearsal, REHEARSAL_SCENARIOS } from './rehearsal';

const now = 1_799_999_000_000;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function apply(trade: Trade, kind: Parameters<typeof applyTradeEvent>[1]['kind'], checked = false) {
  return applyTradeEvent(trade, {
    id: `continue-${trade.revision + 1}`,
    tradeId: trade.id,
    revision: trade.revision + 1,
    kind,
    bankReceiptChecked: checked
  });
}

describe('sandbox exercise catalog', () => {
  it('contains only the six bounded exercises and freezes every catalog entry', () => {
    expect(REHEARSAL_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'buy',
      'sell',
      'delayed_payment',
      'seller_receipt',
      'refund',
      'unavailable'
    ]);
    expect(new Set(REHEARSAL_SCENARIOS.map((scenario) => scenario.id)).size).toBe(6);
    expect(Object.isFrozen(REHEARSAL_SCENARIOS)).toBe(true);
    for (const scenario of REHEARSAL_SCENARIOS) {
      expect(Object.isFrozen(scenario)).toBe(true);
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeGreaterThan(0);
    }
  });

  it.each(['', 'unknown', 'BUY', ' buy', '__proto__', null, undefined])(
    'rejects unknown exercise %j',
    async (id) => {
      await expect(prepareRehearsal(id as never, now)).rejects.toThrow(RangeError);
    }
  );
});

describe('fresh, deterministic rehearsal state', () => {
  it.each(['buy', 'sell'] as const)(
    'starts %s with a clean form and no accepted trade',
    async (id) => {
      expect(await prepareRehearsal(id, now)).toEqual({
        intent: id,
        amount: '150',
        scenario: 'available',
        trade: null
      });
    }
  );

  it('starts an unavailable exercise before searching, and allows a subsequent fixture recovery', async () => {
    const state = await prepareRehearsal('unavailable', now);
    expect(state).toEqual({ intent: 'buy', amount: '150', scenario: 'offline', trade: null });
    const market = createPreviewMarketplace();
    await expect(
      market.findQuotes(state.intent, 15_000, state.scenario, now)
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(await market.findQuotes(state.intent, 15_000, 'available', now)).toHaveLength(2);
  });

  it.each([
    ['delayed_payment', 'buy', 'payment_sent'],
    ['seller_receipt', 'sell', 'receipt_review'],
    ['refund', 'buy', 'refund_pending']
  ] as const)(
    'builds %s through valid quote commitments and ordered events',
    async (id, intent, stage) => {
      const state = await prepareRehearsal(id, now);
      expect(state).toMatchObject({
        intent,
        amount: '150',
        scenario: 'available',
        trade: {
          state: stage,
          revision: 2,
          quote: {
            mode: 'preview',
            intent,
            fiatCents: 15_000,
            createdAt: now,
            expiresAt: now + 60_000
          }
        }
      });
      expect(state.trade?.eventIds).toEqual([`rehearsal-${id}-1`, `rehearsal-${id}-2`]);
      expect(new Set(state.trade?.eventIds).size).toBe(2);
      expect(state.trade?.lastEventId).toBe(`rehearsal-${id}-2`);
    }
  );

  it('does not preconfirm seller receipt and still needs explicit acknowledgement and release observation', async () => {
    const { trade } = await prepareRehearsal('seller_receipt', now);
    if (!trade) throw new Error('Expected the seller exercise trade.');
    expect(() => apply(trade, 'seller_confirmed_receipt')).toThrow(
      expect.objectContaining({
        code: 'invalid_transition'
      })
    );
    expect(() => apply(trade, 'release_confirmed')).toThrow(
      expect.objectContaining({
        code: 'invalid_transition'
      })
    );
    const acknowledged = apply(trade, 'seller_confirmed_receipt', true);
    expect(acknowledged.state).toBe('release_pending');
    expect(apply(acknowledged, 'release_confirmed').state).toBe('completed');
    expect(trade.state).toBe('receipt_review');
  });

  it('keeps a refund exercise pending and freezes it when a late payment claim arrives', async () => {
    const { trade } = await prepareRehearsal('refund', now);
    if (!trade) throw new Error('Expected the refund exercise trade.');
    expect(apply(trade, 'refund_confirmed').state).toBe('refunded');
    const disputed = apply(trade, 'buyer_marked_paid');
    expect(disputed.state).toBe('disputed');
    expect(() => apply(disputed, 'refund_confirmed')).toThrow(
      expect.objectContaining({
        code: 'invalid_transition'
      })
    );
    expect(trade.state).toBe('refund_pending');
  });

  it('returns fresh deeply frozen state without retaining a previous exercise', async () => {
    const first = await prepareRehearsal('seller_receipt', now);
    const second = await prepareRehearsal('seller_receipt', now);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.trade).not.toBe(first.trade);
    expect(second.trade?.quote).not.toBe(first.trade?.quote);
    expect(second.trade?.quote.offer).not.toBe(first.trade?.quote.offer);
    expect(second.trade?.eventIds).not.toBe(first.trade?.eventIds);
    for (const object of [
      first,
      first.trade,
      first.trade?.quote,
      first.trade?.quote.offer,
      first.trade?.eventIds
    ]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(await prepareRehearsal('buy', now)).toMatchObject({ trade: null, intent: 'buy' });
  });

  it.each(['buy', 'unavailable'] as const)(
    'validates an explicit clock even for the empty %s form',
    async (id) => {
      for (const invalid of [undefined, null, NaN, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
        await expect(prepareRehearsal(id, invalid as number)).rejects.toMatchObject({
          code: 'invalid_amount'
        });
      }
    }
  );

  it('uses the supplied clock and creates no network, storage or timer activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const fetch = vi.fn();
    const getItem = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { getItem, setItem });
    vi.stubGlobal('sessionStorage', { getItem, setItem });
    for (const scenario of REHEARSAL_SCENARIOS) {
      const state = await prepareRehearsal(scenario.id, now);
      if (state.trade) expect(state.trade.quote.createdAt).toBe(now);
      expect(Object.isFrozen(state)).toBe(true);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
