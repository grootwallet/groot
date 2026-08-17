import { invoke } from '@tauri-apps/api/core';
import type {
  FiatCurrency,
  MarketDataPort,
  MarketHistory,
  MarketRange,
  MarketResult,
  MarketStats,
  MarketTicker
} from './types';

type CacheEntry<T> = { value: T; expiresAt: number };
const TICKER_TTL = 60_000;
const HISTORY_TTL = 5 * 60_000;
const STATS_TTL = 15 * 60_000;

export class MarketDataError extends Error {
  constructor(message = 'Market data is temporarily unavailable.') {
    super(message);
    this.name = 'MarketDataError';
  }
}

function validTicker(value: MarketTicker, currency: FiatCurrency): boolean {
  return (
    value.base === 'BTC' &&
    value.quote === currency &&
    value.symbol === `BTC-${currency}` &&
    Number.isFinite(value.price) &&
    value.price > 0
  );
}

function validHistory(value: MarketHistory, currency: FiatCurrency, range: MarketRange): boolean {
  return (
    value.base === 'BTC' &&
    value.quote === currency &&
    value.range === range &&
    value.points.length >= 2 &&
    value.points.every(
      (point, index) =>
        Number.isInteger(point.time) &&
        point.time > 0 &&
        Number.isFinite(point.close) &&
        point.close > 0 &&
        (index === 0 || value.points[index - 1].time < point.time)
    )
  );
}

function validStats(value: MarketStats, currency: FiatCurrency): boolean {
  const values = [
    value.price,
    value.high24h,
    value.low24h,
    value.range24h,
    value.range24hPercent,
    value.change24hPercent,
    value.volume24hBtc,
    value.allTimeHigh,
    value.fromAllTimeHighPercent
  ];
  return (
    value.base === 'BTC' &&
    value.quote === currency &&
    value.symbol === `BTC-${currency}` &&
    values.every(Number.isFinite) &&
    value.price > 0 &&
    value.high24h >= value.low24h &&
    value.low24h > 0 &&
    value.range24h >= 0 &&
    value.volume24hBtc >= 0 &&
    value.allTimeHigh >= value.price &&
    value.sources.length > 0 &&
    !Number.isNaN(Date.parse(value.allTimeHighTime))
  );
}

abstract class CachedMarketData implements MarketDataPort {
  private tickers = new Map<FiatCurrency, CacheEntry<MarketTicker>>();
  private histories = new Map<string, CacheEntry<MarketHistory>>();
  private statistics = new Map<FiatCurrency, CacheEntry<MarketStats>>();

  protected abstract readTicker(currency: FiatCurrency): Promise<MarketTicker>;
  protected abstract readHistory(
    currency: FiatCurrency,
    range: MarketRange
  ): Promise<MarketHistory>;
  protected abstract readStats(currency: FiatCurrency): Promise<MarketStats>;

  async ticker(currency: FiatCurrency): Promise<MarketResult<MarketTicker>> {
    const cached = this.tickers.get(currency);
    if (cached && cached.expiresAt > Date.now()) return { value: cached.value, stale: false };
    try {
      const value = await this.readTicker(currency);
      if (!validTicker(value, currency)) throw new MarketDataError();
      this.tickers.set(currency, { value, expiresAt: Date.now() + TICKER_TTL });
      return { value, stale: false };
    } catch {
      if (cached) return { value: cached.value, stale: true };
      throw new MarketDataError();
    }
  }

  async history(currency: FiatCurrency, range: MarketRange): Promise<MarketResult<MarketHistory>> {
    const key = `${currency}:${range}`;
    const cached = this.histories.get(key);
    if (cached && cached.expiresAt > Date.now()) return { value: cached.value, stale: false };
    try {
      const value = await this.readHistory(currency, range);
      if (!validHistory(value, currency, range)) throw new MarketDataError();
      this.histories.set(key, { value, expiresAt: Date.now() + HISTORY_TTL });
      return { value, stale: false };
    } catch {
      if (cached) return { value: cached.value, stale: true };
      throw new MarketDataError();
    }
  }

  async stats(currency: FiatCurrency): Promise<MarketResult<MarketStats>> {
    const cached = this.statistics.get(currency);
    if (cached && cached.expiresAt > Date.now()) return { value: cached.value, stale: false };
    try {
      const value = await this.readStats(currency);
      if (!validStats(value, currency)) throw new MarketDataError();
      this.statistics.set(currency, { value, expiresAt: Date.now() + STATS_TTL });
      return { value, stale: false };
    } catch {
      if (cached) return { value: cached.value, stale: true };
      throw new MarketDataError();
    }
  }
}

class TauriMarketData extends CachedMarketData {
  protected readTicker(currency: FiatCurrency) {
    return invoke<MarketTicker>('market_ticker', { currency });
  }
  protected readHistory(currency: FiatCurrency, range: MarketRange) {
    return invoke<MarketHistory>('market_history', { currency, range });
  }
  protected readStats(currency: FiatCurrency) {
    return invoke<MarketStats>('market_stats', { currency });
  }
}

const basePrices: Record<FiatCurrency, number> = { USD: 64_345.38, EUR: 55_577.02, GBP: 47_941.12 };
const rangeSeconds: Record<MarketRange, number> = {
  '1D': 86_400,
  '1W': 604_800,
  '1M': 2_592_000,
  '6M': 15_811_200,
  YTD: 19_872_000,
  '1Y': 31_536_000,
  '5Y': 157_680_000,
  ALL: 473_040_000
};

class PrototypeMarketData extends CachedMarketData {
  private shouldFail() {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('groot-market-fixture') === 'offline'
    );
  }
  protected async readTicker(currency: FiatCurrency): Promise<MarketTicker> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (this.shouldFail()) throw new MarketDataError();
    return {
      base: 'BTC',
      quote: currency,
      symbol: `BTC-${currency}`,
      price: basePrices[currency],
      time: new Date().toISOString(),
      source: currency === 'GBP' ? 'Sats Signal · Coinbase + ECB' : 'Sats Signal · Coinbase',
      updatedAt: new Date().toISOString()
    };
  }
  protected async readHistory(currency: FiatCurrency, range: MarketRange): Promise<MarketHistory> {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (this.shouldFail()) throw new MarketDataError();
    const now = Math.floor(Date.now() / 1000);
    const start = now - rangeSeconds[range];
    const base = basePrices[currency];
    const rangeChange: Record<MarketRange, number> = {
      '1D': -0.012,
      '1W': 0.026,
      '1M': -0.034,
      '6M': 0.18,
      YTD: 0.24,
      '1Y': 0.42,
      '5Y': 0.71,
      ALL: 1.85
    };
    const startPrice = base / (1 + rangeChange[range]);
    const points = Array.from({ length: 96 }, (_, index) => {
      const progress = index / 95;
      const wave = Math.sin(progress * Math.PI * 7) * base * 0.018;
      return {
        time: Math.round(start + rangeSeconds[range] * progress),
        close: Number((startPrice + (base - startPrice) * progress + wave).toFixed(2))
      };
    });
    points[points.length - 1].close = base;
    return {
      base: 'BTC',
      quote: currency,
      symbol: `BTC-${currency}`,
      currency,
      range,
      points,
      sources: ['Sats Signal deterministic Regtest fixture'],
      updatedAt: new Date().toISOString()
    };
  }
  protected async readStats(currency: FiatCurrency): Promise<MarketStats> {
    await new Promise((resolve) => setTimeout(resolve, 90));
    if (this.shouldFail()) throw new MarketDataError();
    const price = basePrices[currency];
    const high24h = price * 1.012;
    const low24h = price * 0.983;
    const allTimeHigh = price * 1.91;
    return {
      base: 'BTC',
      quote: currency,
      symbol: `BTC-${currency}`,
      price,
      high24h: Number(high24h.toFixed(2)),
      low24h: Number(low24h.toFixed(2)),
      range24h: Number((high24h - low24h).toFixed(2)),
      range24hPercent: Number((((high24h - low24h) / low24h) * 100).toFixed(2)),
      change24hPercent: -1.12,
      volume24hBtc: 216,
      allTimeHigh: Number(allTimeHigh.toFixed(2)),
      allTimeHighTime: '2025-10-06T00:00:00.000Z',
      fromAllTimeHighPercent: Number((((price - allTimeHigh) / allTimeHigh) * 100).toFixed(2)),
      sources: ['Sats Signal deterministic Regtest fixture'],
      updatedAt: new Date().toISOString()
    };
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const marketService: MarketDataPort = isTauri
  ? new TauriMarketData()
  : new PrototypeMarketData();
