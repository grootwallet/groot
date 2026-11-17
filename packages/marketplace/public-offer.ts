/** Portable public listing data. This does not establish an executable quote or eligibility. */
export type MarketplaceProvider = 'hodlhodl' | 'localcoinswap';
export type MarketplaceIntent = 'buy' | 'sell';

export interface PublicOffer {
  readonly provider: MarketplaceProvider;
  readonly indicative: true;
  readonly id: string;
  readonly version?: string;
  readonly intent: MarketplaceIntent;
  readonly currency: 'EUR';
  readonly paymentMethod: 'sepa_instant';
  /** Display-only cents; exactPricePerBtc, when supplied, owns arithmetic and comparison. */
  readonly pricePerBtcCents: number;
  /** Exact advertised EUR/BTC price, without floating point. units / 10^scale EUR. */
  readonly exactPricePerBtc?: Readonly<{ units: string; scale: number }>;
  readonly minFiatCents: number;
  readonly maxFiatCents: number;
  readonly firstTradeLimitCents: number | null;
  readonly requiresExperiencedUser: boolean | null;
  readonly requiresPhoneVerification?: boolean | null;
  readonly minimumFeedbackPercent?: number | null;
  readonly paymentWindowMinutes: number | null;
  readonly confirmations: number | null;
  readonly terms: string | null;
  readonly counterparty: {
    readonly id?: string;
    readonly alias: string;
    readonly completedTrades: number | null;
    /** Only normalized fractional reputation, not a provider's five-star scale. */
    readonly ratingBasisPoints: number | null;
    readonly averagePaymentMinutes: number | null;
    readonly averageReleaseMinutes: number | null;
  };
  readonly observedAtMs: number;
  readonly url: string;
}
