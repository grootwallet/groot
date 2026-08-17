export const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];

export const MARKET_RANGES = ['1D', '1W', '1M', '6M', 'YTD', '1Y', '5Y', 'ALL'] as const;
export type MarketRange = (typeof MARKET_RANGES)[number];

export type MarketTicker = {
  base: 'BTC';
  quote: FiatCurrency;
  symbol: string;
  price: number;
  time: string;
  source: string;
  updatedAt: string;
};

export type MarketPoint = { time: number; close: number };

export type MarketHistory = {
  base: 'BTC';
  quote: FiatCurrency;
  symbol: string;
  currency: FiatCurrency;
  range: MarketRange;
  points: MarketPoint[];
  sources: string[];
  updatedAt: string;
};

export type MarketStats = {
  base: 'BTC';
  quote: FiatCurrency;
  symbol: string;
  price: number;
  high24h: number;
  low24h: number;
  range24h: number;
  range24hPercent: number;
  change24hPercent: number;
  volume24hBtc: number;
  allTimeHigh: number;
  allTimeHighTime: string;
  fromAllTimeHighPercent: number;
  sources: string[];
  updatedAt: string;
};

export type MarketResult<T> = { value: T; stale: boolean };

export interface MarketDataPort {
  ticker(currency: FiatCurrency): Promise<MarketResult<MarketTicker>>;
  history(currency: FiatCurrency, range: MarketRange): Promise<MarketResult<MarketHistory>>;
  stats(currency: FiatCurrency): Promise<MarketResult<MarketStats>>;
}
