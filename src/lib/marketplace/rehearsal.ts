import {
  applyTradeEvent,
  MarketError,
  startPreviewTrade,
  type EventKind,
  type Intent,
  type Trade
} from '../../../packages/marketplace/core';
import { createPreviewMarketplace, type PreviewScenario } from './index';

/** Titles and descriptions are translation keys; every exercise uses only owned synthetic fixtures. */
export const REHEARSAL_SCENARIOS = Object.freeze(
  (
    [
      {
        id: 'buy',
        title: 'Buy bitcoin',
        description: 'Find an offer and try buying from the start.'
      },
      {
        id: 'sell',
        title: 'Sell bitcoin',
        description: 'Find an offer and try selling from the start.'
      },
      {
        id: 'delayed_payment',
        title: 'Payment is taking longer',
        description: 'Payment is marked sent. See how to wait safely or ask for help.'
      },
      {
        id: 'seller_receipt',
        title: 'Check a buyer’s payment',
        description: 'The buyer says they paid. Check the receipt before releasing bitcoin.'
      },
      {
        id: 'refund',
        title: 'Follow a refund',
        description: 'A cancellation is waiting for its refund. See what happens next.'
      },
      {
        id: 'unavailable',
        title: 'Offers are unavailable',
        description: 'Offers cannot be loaded. Try the recovery path.'
      }
    ] as const
  ).map((scenario) => Object.freeze(scenario))
);

export type RehearsalScenarioId = (typeof REHEARSAL_SCENARIOS)[number]['id'];

export type RehearsalState = Readonly<{
  intent: Intent;
  amount: string;
  scenario: PreviewScenario;
  trade: Trade | null;
}>;

/** A fresh rehearsal, never a resumed real trade. The caller supplies the clock explicitly. */
export async function prepareRehearsal(
  id: RehearsalScenarioId,
  nowMs: number
): Promise<RehearsalState> {
  if (!REHEARSAL_SCENARIOS.some((scenario) => scenario.id === id))
    throw new RangeError('Unknown sandbox exercise.');
  // Reject absent clocks instead of invoking the fixture adapter's optional real-clock default.
  if (!Number.isSafeInteger(nowMs)) throw new MarketError('invalid_amount');

  const intent: Intent = id === 'sell' || id === 'seller_receipt' ? 'sell' : 'buy';
  const quotes = await createPreviewMarketplace().findQuotes(intent, 15_000, 'available', nowMs);
  const base: RehearsalState = {
    intent,
    amount: '150',
    scenario: id === 'unavailable' ? 'offline' : 'available',
    trade: null
  };
  if (id === 'buy' || id === 'sell' || id === 'unavailable') return Object.freeze(base);

  const quote = quotes[0];
  if (!quote) throw new MarketError('no_offers');
  let trade = startPreviewTrade(quote, nowMs);
  const events: readonly EventKind[] = [
    'escrow_confirmed',
    id === 'refund' ? 'request_refund' : 'buyer_marked_paid'
  ];
  for (const kind of events) {
    const revision = trade.revision + 1;
    trade = applyTradeEvent(trade, {
      id: `rehearsal-${id}-${revision}`,
      tradeId: trade.id,
      revision,
      kind
    });
  }
  return Object.freeze({ ...base, trade });
}
