<script lang="ts">
  import type { FiatCurrency, MarketPoint, MarketRange } from '$lib/market';
  import { formatFiat } from '$lib/market';

  let { points, currency, range, firstPrice, trend } = $props<{
    points: MarketPoint[];
    currency: FiatCurrency;
    range: MarketRange;
    firstPrice: number;
    trend: 'up' | 'down';
  }>();
  let activeIndex = $state(-1);
  let geometry = $derived.by(() => {
    if (!points.length) {
      return {
        line: '',
        area: '',
        min: 0,
        max: 0,
        scaleMin: 0,
        scaleMax: 0,
        coordinates: [] as { x: number; y: number }[]
      };
    }
    const values = points.map((point: MarketPoint) => point.close);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = Math.max((rawMax - rawMin) * 0.1, rawMax * 0.004);
    const scaleMin = Math.max(0, rawMin - pad);
    const scaleMax = rawMax + pad;
    const coordinates = points.map((point: MarketPoint, index: number) => ({
      x: 1 + (index / Math.max(points.length - 1, 1)) * 98,
      y: 4 + ((scaleMax - point.close) / Math.max(scaleMax - scaleMin, 1)) * 86
    }));
    const line = coordinates
      .map(
        (point: { x: number; y: number }, index: number) =>
          `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`
      )
      .join(' ');
    return {
      line,
      area: `${line} L99,94 L1,94 Z`,
      min: rawMin,
      max: rawMax,
      scaleMin,
      scaleMax,
      coordinates
    };
  });
  let activePoint = $derived(activeIndex >= 0 ? points[activeIndex] : null);
  let activeCoordinate = $derived(activeIndex >= 0 ? geometry.coordinates[activeIndex] : null);
  let activeChange = $derived(
    activePoint && firstPrice ? ((activePoint.close - firstPrice) / firstPrice) * 100 : 0
  );
  let yTicks = $derived(
    [4, 25.5, 47, 68.5, 90].map((position) => ({
      position,
      value: geometry.scaleMax - ((position - 4) / 86) * (geometry.scaleMax - geometry.scaleMin)
    }))
  );
  let xTicks = $derived(
    Array.from({ length: 6 }, (_, index) => {
      const pointIndex = Math.round((index / 5) * Math.max(points.length - 1, 0));
      return points[pointIndex];
    }).filter(Boolean)
  );
  let latest = $derived(points.at(-1));
  let latestY = $derived(
    latest
      ? 4 +
          ((geometry.scaleMax - latest.close) /
            Math.max(geometry.scaleMax - geometry.scaleMin, 1)) *
            86
      : 0
  );

  function selectFromPointer(event: PointerEvent) {
    const bounds =
      event.currentTarget instanceof Element ? event.currentTarget.getBoundingClientRect() : null;
    if (!bounds || !points.length) return;
    const progress = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    activeIndex = Math.round(progress * (points.length - 1));
  }

  function exploreWithKeyboard(event: KeyboardEvent) {
    if (!points.length) return;
    const current = activeIndex >= 0 ? activeIndex : points.length - 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.max(0, current - 1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.min(points.length - 1, current + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      activeIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      activeIndex = points.length - 1;
    }
  }

  function dateLabel(time: number, full = false) {
    const options: Intl.DateTimeFormatOptions = full
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : range === '1D'
        ? { hour: 'numeric', minute: '2-digit' }
        : {
            day: 'numeric',
            month: 'short',
            year: range === 'ALL' || range === '5Y' ? '2-digit' : undefined
          };
    return new Intl.DateTimeFormat('en-US', options).format(new Date(time * 1000));
  }

  function compactFiat(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  }
</script>

<div class="market-chart" data-trend={trend}>
  <div class="chart-range">
    <span>{range} range</span>
    <strong>{compactFiat(geometry.min)} — {compactFiat(geometry.max)}</strong>
  </div>
  <div class="chart-stage">
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Bitcoin price history in ${currency} for ${range}`}
    >
      <defs>
        <linearGradient id="market-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="currentColor" stop-opacity="0.16" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g class="market-chart-grid">
        {#each yTicks.slice(1) as tick}<line
            x1="1"
            x2="99"
            y1={tick.position}
            y2={tick.position}
          />{/each}
      </g>
      <path class="market-chart-area" d={geometry.area} />
      <path class="market-chart-line" d={geometry.line} vector-effect="non-scaling-stroke" />
      {#if activeCoordinate}
        <g class="market-chart-crosshair">
          <line x1={activeCoordinate.x} x2={activeCoordinate.x} y1="4" y2="94" />
          <line x1="1" x2="99" y1={activeCoordinate.y} y2={activeCoordinate.y} />
        </g>
      {/if}
    </svg>
    <input
      class="market-chart-slider"
      type="range"
      min="0"
      max={Math.max(points.length - 1, 0)}
      value={Math.max(activeIndex, points.length - 1)}
      aria-label="Explore market chart"
      aria-valuetext={activePoint
        ? `${formatFiat(activePoint.close, currency)} on ${dateLabel(activePoint.time, true)}`
        : `Latest ${formatFiat(latest?.close ?? 0, currency)}`}
      onpointermove={selectFromPointer}
      onpointerleave={() => (activeIndex = -1)}
      onkeydown={exploreWithKeyboard}
      oninput={(event) => (activeIndex = Number(event.currentTarget.value))}
      onblur={() => (activeIndex = -1)}
    />
    {#if activeCoordinate}<span
        class="market-chart-point"
        style={`left:${activeCoordinate.x}%;top:${activeCoordinate.y}%`}
        aria-hidden="true"
      ></span>{/if}
    <div class="market-chart-y" aria-hidden="true">
      {#each yTicks as tick}<span style={`top:${tick.position}%`}>{compactFiat(tick.value)}</span
        >{/each}
    </div>
    {#if latest}<span class="market-chart-latest" style={`top:${latestY}%`}
        >{compactFiat(latest.close)}</span
      >{/if}
    {#if activePoint && activeCoordinate}
      <div
        class="market-chart-tooltip"
        style={`left:clamp(112px, ${activeCoordinate.x}%, calc(100% - 112px))`}
      >
        <strong>{formatFiat(activePoint.close, currency)}</strong>
        <span class:negative={activeChange < 0}
          >{activeChange >= 0 ? '+' : '−'}{formatFiat(
            Math.abs(activePoint.close - firstPrice),
            currency
          )} ({Math.abs(activeChange).toFixed(2)}%)</span
        >
        <small>{dateLabel(activePoint.time, true)}</small>
      </div>
    {/if}
  </div>
  <div class="market-chart-x" aria-hidden="true">
    {#each xTicks as tick, index}
      <span class:mobile-hidden={index === 1 || index === 4}
        >{index === xTicks.length - 1 ? 'Now' : dateLabel(tick.time)}</span
      >
    {/each}
  </div>
</div>

<style>
  .market-chart {
    --trend: var(--success);
    color: var(--trend);
  }
  .market-chart[data-trend='down'] {
    --trend: var(--danger);
  }
  .chart-range {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 34px;
    color: var(--muted);
    font-size: 10px;
  }
  .chart-range strong {
    color: var(--muted);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .chart-stage {
    position: relative;
    height: clamp(300px, 40vw, 470px);
  }
  .chart-stage:has(.market-chart-slider:focus-visible) {
    border-radius: 6px;
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .market-chart-grid line {
    stroke: var(--border);
    stroke-width: 0.7;
    vector-effect: non-scaling-stroke;
  }
  .market-chart-area {
    fill: url('#market-area');
  }
  .market-chart-line {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .market-chart-crosshair line {
    stroke: var(--muted);
    stroke-width: 0.9;
    stroke-dasharray: 2 4;
    vector-effect: non-scaling-stroke;
  }
  .market-chart-slider {
    position: absolute;
    inset: 0;
    z-index: 4;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: crosshair;
  }
  .market-chart-slider:focus-visible {
    accent-color: var(--trend);
    outline: none;
  }
  .market-chart-point {
    position: absolute;
    z-index: 3;
    width: 8px;
    height: 8px;
    border: 2px solid var(--panel);
    border-radius: 50%;
    background: var(--trend);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .market-chart-y {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .market-chart-y span,
  .market-chart-latest {
    position: absolute;
    right: 3px;
    padding: 2px 4px;
    border-radius: 4px;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    transform: translateY(-50%);
  }
  .market-chart-y span {
    color: var(--muted);
    background: color-mix(in srgb, var(--panel) 84%, transparent);
  }
  .market-chart-latest {
    z-index: 3;
    padding: 3px 6px;
    color: white;
    background: var(--trend);
    font-weight: 700;
  }
  .market-chart-tooltip {
    position: absolute;
    z-index: 5;
    top: 14px;
    width: min(220px, calc(100% - 24px));
    padding: 14px 15px;
    display: grid;
    gap: 5px;
    border: 1px solid var(--border-strong);
    border-radius: 9px;
    color: var(--text);
    background: color-mix(in srgb, var(--panel-2) 94%, transparent);
    box-shadow: 0 12px 32px color-mix(in srgb, var(--bg) 48%, transparent);
    text-align: center;
    pointer-events: none;
    transform: translateX(-50%);
    backdrop-filter: blur(14px);
  }
  .market-chart-tooltip strong {
    font-size: 20px;
    font-variant-numeric: tabular-nums;
  }
  .market-chart-tooltip span {
    color: var(--success);
    font-size: 11px;
    font-weight: 700;
  }
  .market-chart-tooltip span.negative {
    color: var(--danger);
  }
  .market-chart-tooltip small {
    color: var(--muted);
    font-size: 10px;
  }
  .market-chart-x {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    padding-top: 6px;
    color: var(--muted);
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .market-chart-x span {
    text-align: center;
    white-space: nowrap;
  }
  .market-chart-x span:first-child {
    text-align: left;
  }
  .market-chart-x span:last-child {
    text-align: right;
  }
  @media (max-width: 720px) {
    .chart-stage {
      height: 300px;
    }
    .market-chart-x {
      grid-template-columns: repeat(4, 1fr);
    }
    .market-chart-x .mobile-hidden {
      display: none;
    }
    .market-chart-tooltip {
      width: min(204px, calc(100% - 20px));
    }
  }
</style>
