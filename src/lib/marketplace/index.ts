import {
  bestPreviewQuotes,
  MarketError,
  type Intent,
  type PreviewOffer
} from '../../../packages/marketplace/core';

export * from '../../../packages/marketplace/core';

export type PreviewScenario = 'available' | 'empty' | 'offline';

/** Explicitly synthetic. This adapter has no wallet, bank, provider or storage access. */
const offers: readonly PreviewOffer[] = (['buy', 'sell'] as const).flatMap((intent) => [
  {
    id: `${intent}-river`,
    alias: 'River',
    intent,
    priceCentsPerBtc: 6_250_000,
    minCents: 5_000,
    maxCents: 25_000,
    completedTrades: 154,
    completionPercent: 99,
    available: true
  },
  {
    id: `${intent}-cedar`,
    alias: 'Cedar',
    intent,
    priceCentsPerBtc: intent === 'buy' ? 6_290_000 : 6_210_000,
    minCents: 5_000,
    maxCents: 20_000,
    completedTrades: 87,
    completionPercent: 98,
    available: true
  }
]);

export function createPreviewMarketplace() {
  return {
    mode: 'preview' as const,
    async findQuotes(intent: Intent, cents: number, scenario: PreviewScenario, nowMs = Date.now()) {
      if (scenario === 'offline') throw new MarketError('unavailable');
      return bestPreviewQuotes(scenario === 'empty' ? [] : offers, intent, cents, nowMs);
    }
  };
}
