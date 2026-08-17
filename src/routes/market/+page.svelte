<script lang="ts">
  import { RefreshCw, WifiOff } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import MarketChart from '$lib/components/MarketChart.svelte';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import {
    FIAT_CURRENCIES,
    MARKET_RANGES,
    fiatCurrency,
    formatFiat,
    marketService,
    setFiatCurrency,
    type FiatCurrency,
    type MarketHistory,
    type MarketRange,
    type MarketStats,
    type MarketTicker
  } from '$lib/market';

  let range = $state<MarketRange>('1M');
  let ticker = $state<MarketTicker | null>(null);
  let history = $state<MarketHistory | null>(null);
  let stats = $state<MarketStats | null>(null);
  let loading = $state(true);
  let error = $state('');
  let stale = $state(false);
  let revision = 0;
  let first = $derived(history?.points[0]?.close ?? ticker?.price ?? 0);
  let last = $derived(ticker?.price ?? history?.points.at(-1)?.close ?? 0);
  let changeAmount = $derived(last - first);
  let change = $derived(first ? (changeAmount / first) * 100 : 0);
  let trend = $derived<'up' | 'down'>(change >= 0 ? 'up' : 'down');
  let chartPoints = $derived.by(() => {
    if (!history?.points.length || !ticker) return history?.points ?? [];
    return [...history.points.slice(0, -1), { ...history.points.at(-1)!, close: ticker.price }];
  });
  let priceParts = $derived.by(() => {
    if (!ticker) return { whole: '—', decimals: '' };
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: $fiatCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).formatToParts(ticker.price);
    return {
      whole: parts
        .filter((part) => part.type !== 'decimal' && part.type !== 'fraction')
        .map((part) => part.value)
        .join(''),
      decimals: parts
        .filter((part) => part.type === 'decimal' || part.type === 'fraction')
        .map((part) => part.value)
        .join('')
    };
  });

  const percent = (value: number) => `${Math.abs(value).toFixed(2)}%`;
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(value));
  const shortDate = (value: string) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(value));
  const btcVolume = (value: number) =>
    `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} BTC`;

  onMount(() => {
    void load();
    const retryOnline = () => void load();
    window.addEventListener('online', retryOnline);
    return () => window.removeEventListener('online', retryOnline);
  });

  async function load() {
    const current = ++revision;
    const currency = $fiatCurrency;
    if (ticker?.quote !== currency || history?.quote !== currency || history?.range !== range) {
      ticker = null;
      history = null;
      stats = null;
    }
    loading = true;
    error = '';
    try {
      const [nextTicker, nextHistory, nextStats] = await Promise.all([
        marketService.ticker(currency),
        marketService.history(currency, range),
        marketService.stats(currency).catch(() => null)
      ]);
      if (current !== revision) return;
      ticker = nextTicker.value;
      history = nextHistory.value;
      stats = nextStats?.value ?? stats;
      stale = nextTicker.stale || nextHistory.stale || Boolean(nextStats?.stale);
    } catch {
      if (current !== revision) return;
      error = navigator.onLine
        ? 'Market data is temporarily unavailable.'
        : 'You are offline. Reconnect to refresh market data.';
    } finally {
      if (current === revision) loading = false;
    }
  }

  function chooseCurrency(currency: FiatCurrency) {
    if (currency === $fiatCurrency) return;
    setFiatCurrency(currency);
    void load();
  }

  function chooseRange(next: MarketRange) {
    if (next === range) return;
    range = next;
    void load();
  }
</script>

<div class="page market-page" data-trend={trend}>
  <header class="page-header market-header">
    <div>
      <p class="eyebrow">MARKET</p>
      <h1>Bitcoin price</h1>
      <p>Market context without sharing wallet data.</p>
    </div>
    <span class="theme-choice" aria-label="Fiat currency">
      {#each FIAT_CURRENCIES as currency}
        <button
          class:active={$fiatCurrency === currency}
          aria-pressed={$fiatCurrency === currency}
          onclick={() => chooseCurrency(currency)}>{currency}</button
        >
      {/each}
    </span>
  </header>

  {#if loading && !ticker && !history}
    <section class="market-loading" aria-label="Loading market data">
      <WalletSkeleton variant="balance" />
    </section>
  {:else if error && !ticker && !history}
    <section class="market-error" role="alert">
      <span><WifiOff size={22} /></span>
      <div>
        <strong>Price unavailable</strong>
        <p>{error}</p>
      </div>
      <Button variant="secondary" onclick={load}><RefreshCw size={15} />Retry</Button>
    </section>
  {:else if ticker && history}
    <section class="market-content content-reveal" aria-live="polite">
      <div class="market-top">
        <div class="market-price">
          <div class="market-live">
            <span class:stale></span><strong>Bitcoin price</strong><small
              >· {stale ? 'Saved' : 'Live'}</small
            >
          </div>
          <div class="market-price-row">
            <div class="market-price-value" aria-label={formatFiat(ticker.price, $fiatCurrency)}>
              <span>{priceParts.whole}</span><strong>{priceParts.decimals}</strong>
            </div>
            <div class="market-change">
              <span>{trend === 'up' ? '↗' : '↘'}</span>
              {changeAmount >= 0 ? '+' : '−'}{formatFiat(Math.abs(changeAmount), $fiatCurrency)}
              <span>({percent(change)})</span>
            </div>
          </div>
          <p>{timestamp(ticker.time)} · BTC / {$fiatCurrency} · {range} change</p>
        </div>

        <dl class="market-stats" aria-label="Bitcoin market statistics">
          <div>
            <dt>24h high</dt>
            <dd>{stats ? formatFiat(stats.high24h, $fiatCurrency) : '—'}</dd>
          </div>
          <div>
            <dt>24h low</dt>
            <dd>{stats ? formatFiat(stats.low24h, $fiatCurrency) : '—'}</dd>
          </div>
          <div>
            <dt>24h range</dt>
            <dd>
              {stats ? formatFiat(stats.range24h, $fiatCurrency) : '—'}<small
                >{stats ? percent(stats.range24hPercent) : 'Unavailable'}</small
              >
            </dd>
          </div>
          <div>
            <dt>All-time high</dt>
            <dd>
              {stats ? formatFiat(stats.allTimeHigh, $fiatCurrency) : '—'}<small
                >{stats ? shortDate(stats.allTimeHighTime) : 'Unavailable'}</small
              >
            </dd>
          </div>
          <div>
            <dt>From ATH</dt>
            <dd>
              {stats
                ? `${stats.fromAllTimeHighPercent >= 0 ? '+' : '−'}${percent(stats.fromAllTimeHighPercent)}`
                : '—'}<small>Current price</small>
            </dd>
          </div>
          <div>
            <dt>24h volume</dt>
            <dd>{stats ? btcVolume(stats.volume24hBtc) : '—'}<small>Coinbase</small></dd>
          </div>
        </dl>
      </div>

      <nav class="market-ranges" aria-label="Chart range">
        {#each MARKET_RANGES as option}
          <button
            class:active={range === option}
            aria-pressed={range === option}
            onclick={() => chooseRange(option)}>{option}</button
          >
        {/each}
      </nav>

      <MarketChart
        points={chartPoints}
        currency={$fiatCurrency}
        {range}
        firstPrice={first}
        {trend}
      />

      <footer class="market-footer">
        <span
          >{stale
            ? 'Showing the last saved result.'
            : 'Market data by Coinbase, Kraken and ECB'}</span
        >
        <div>
          <a
            href={`https://sats-signal.vercel.app/compare?currency=${$fiatCurrency}`}
            target="_blank"
            rel="noreferrer">Compare exchanges</a
          >
          <a href="https://sats-signal.vercel.app/methodology" target="_blank" rel="noreferrer"
            >Methodology</a
          >
          <button onclick={load} disabled={loading}
            ><RefreshCw size={13} class={loading ? 'spin' : ''} />Refresh</button
          >
        </div>
      </footer>
    </section>
  {/if}
</div>

<style>
  .market-page {
    --trend: var(--success);
    max-width: 1180px;
  }
  .market-page[data-trend='down'] {
    --trend: var(--danger);
  }
  .market-header {
    align-items: flex-end;
  }
  .market-header p:last-child {
    margin: 7px 0 0;
    color: var(--muted);
  }
  .market-loading,
  .market-error {
    padding: clamp(20px, 4vw, 38px);
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
  }
  .market-content {
    min-width: 0;
  }
  .market-top {
    display: grid;
    grid-template-columns: minmax(330px, 0.95fr) minmax(390px, 1.05fr);
    gap: clamp(28px, 5vw, 64px);
    align-items: end;
    margin-top: clamp(28px, 5vh, 52px);
  }
  .market-live {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
    font-size: 12px;
  }
  .market-live > span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
  }
  .market-live > span.stale {
    background: var(--warning-text);
  }
  .market-live strong {
    font-weight: 700;
  }
  .market-live small {
    font-size: inherit;
  }
  .market-price-row {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 13px;
    margin-top: 13px;
  }
  .market-price-value {
    color: var(--text);
    font-size: clamp(45px, 6.8vw, 78px);
    font-weight: 650;
    line-height: 0.92;
    letter-spacing: -0.065em;
    font-variant-numeric: tabular-nums;
  }
  .market-price-value strong {
    margin-left: 0.04em;
    color: var(--trend);
    font-size: 0.52em;
    letter-spacing: -0.035em;
  }
  .market-change {
    margin-bottom: 5px;
    color: var(--trend);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .market-change > span:first-child {
    margin-right: 3px;
  }
  .market-change > span:last-child {
    margin-left: 3px;
  }
  .market-price > p {
    margin: 13px 0 0;
    color: var(--muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .market-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0;
    border-top: 1px solid var(--border);
  }
  .market-stats > div {
    min-width: 0;
    padding: 11px 10px 9px;
    border-left: 1px solid var(--border);
  }
  .market-stats dt {
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  .market-stats dd {
    margin: 0;
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .market-stats small {
    display: block;
    margin-top: 5px;
    color: var(--muted);
    font-size: 8px;
    font-weight: 500;
  }
  .market-ranges {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    width: min(100%, 640px);
    gap: 6px;
    margin: clamp(25px, 4vh, 38px) 0 10px;
  }
  .market-ranges button {
    min-height: 36px;
    padding: 6px 4px;
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    color: var(--muted);
    background: transparent;
    font-size: 10px;
    font-weight: 700;
    transition:
      color 160ms ease,
      background 160ms ease,
      border-color 160ms ease,
      transform 100ms ease;
  }
  .market-ranges button:active {
    transform: scale(0.98);
  }
  .market-ranges button.active {
    border-color: var(--text);
    color: var(--bg);
    background: var(--text);
  }
  .market-ranges button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .market-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    color: var(--muted);
    font-size: 9px;
  }
  .market-footer > div {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
  }
  .market-footer a {
    color: inherit;
    text-decoration: none;
  }
  .market-footer a:hover {
    color: var(--text);
  }
  .market-footer button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px;
    border: 0;
    color: var(--muted);
    background: transparent;
    font-size: inherit;
  }
  .market-error {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 13px;
  }
  .market-error > span {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 9px;
    color: var(--muted);
    background: var(--surface-icon);
  }
  .market-error p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 10px;
  }
  @media (max-width: 940px) {
    .market-top {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 720px) {
    .market-header {
      align-items: flex-start;
      gap: 18px;
    }
    .market-top {
      margin-top: 26px;
      gap: 34px;
    }
    .market-price-value {
      font-size: clamp(43px, 14vw, 62px);
    }
    .market-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .market-stats > div {
      min-height: 76px;
      padding: 14px 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .market-stats dd {
      font-size: 12px;
    }
    .market-ranges {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
    }
    .market-footer {
      align-items: flex-start;
      flex-direction: column;
      padding-bottom: calc(78px + env(safe-area-inset-bottom));
    }
    .market-error {
      grid-template-columns: 38px minmax(0, 1fr);
    }
    .market-error :global(.button) {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
