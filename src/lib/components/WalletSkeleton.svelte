<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  let {
    variant = 'transactions',
    count = 3,
    header = false
  } = $props<{
    variant?: 'balance' | 'transactions' | 'coins' | 'diagnostics';
    count?: number;
    header?: boolean;
  }>();
  let balanceVariant = $derived(variant === 'balance');
  let transactionVariant = $derived(variant === 'transactions');
  let coinVariant = $derived(variant === 'coins');
  let diagnosticsVariant = $derived(variant === 'diagnostics');
</script>

<div
  class="wallet-skeleton"
  class:balance={balanceVariant}
  class:transactions={transactionVariant}
  class:coins={coinVariant}
  class:diagnostics={diagnosticsVariant}
  role="status"
  aria-label={translate(
    $locale,
    diagnosticsVariant ? 'Loading diagnostics…' : 'Loading wallet data'
  )}
  aria-live="polite"
>
  <span class="sr-only"
    >{translate(
      $locale,
      diagnosticsVariant ? 'Loading diagnostics…' : 'Loading wallet data…'
    )}</span
  >
  {#if diagnosticsVariant}
    {#if header}<div class="diagnostics-skeleton-header" aria-hidden="true">
        <span class="skeleton-copy">
          <span class="skeleton-line eyebrow"></span>
          <span class="skeleton-line heading"></span>
          <span class="skeleton-line subtitle"></span>
        </span>
        <span class="skeleton-control back"></span>
      </div>{/if}
    <div class="diagnostics-skeleton-summary" aria-hidden="true">
      <span class="skeleton-copy">
        <span class="skeleton-line primary"></span>
        <span class="skeleton-line secondary"></span>
      </span>
      <span class="diagnostics-skeleton-actions">
        <span class="skeleton-control"></span><span class="skeleton-control"></span>
      </span>
    </div>
    <span class="diagnostics-skeleton-catalog skeleton-line" aria-hidden="true"></span>
    <div class="diagnostics-skeleton-controls" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
    <span class="diagnostics-skeleton-results skeleton-line" aria-hidden="true"></span>
    <div class="diagnostics-skeleton-rows" aria-hidden="true">
      {#each Array(count) as _, index}
        <div class="skeleton-row">
          <span class="skeleton-copy">
            <span class="skeleton-line primary" style:width={`${64 + (index % 2) * 10}%`}></span>
            <span class="skeleton-line secondary"></span>
          </span>
          <span class="skeleton-copy">
            <span class="skeleton-line primary"></span>
            <span class="skeleton-line secondary"></span>
          </span>
          <span class="skeleton-copy end">
            <span class="skeleton-line primary"></span>
            <span class="skeleton-line secondary"></span>
          </span>
        </div>
      {/each}
    </div>
  {:else if variant === 'balance'}
    <span class="skeleton-line label"></span>
    <span class="skeleton-line amount"></span>
    <span class="skeleton-line pending"></span>
  {:else}
    {#each Array(count) as _, index}
      <div class="skeleton-row" aria-hidden="true">
        <span class="skeleton-block icon"></span>
        <span class="skeleton-copy">
          <span class="skeleton-line primary" style:width={`${58 + (index % 3) * 8}%`}></span>
          <span class="skeleton-line secondary" style:width={`${42 + (index % 2) * 11}%`}></span>
        </span>
        <span class="skeleton-copy end">
          <span class="skeleton-line primary"></span>
          <span class="skeleton-line secondary"></span>
        </span>
      </div>
    {/each}
  {/if}
</div>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.eyebrow):where(.eyebrow) {
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    font-weight: 600;
    letter-spacing: 0.14em;
    margin: 0;
  }
  :global(.subtitle):where(.subtitle) {
    color: var(--muted);
    font-size: 14px;
    margin: 8px 0 0;
  }
  :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header),
  :global(.diagnostics-skeleton-summary):where(.diagnostics-skeleton-summary) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }
  :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header) {
    min-height: 94px;
    margin-bottom: 3px;
  }
  :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header)
    :global(.skeleton-copy) {
    width: min(300px, 55vw);
  }
  :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header) :global(.eyebrow) {
    width: 68px;
    height: 7px;
  }
  :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header) :global(.heading) {
    width: 168px;
    height: 26px;
  }
  :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header) :global(.subtitle) {
    width: 244px;
  }
  :global(.skeleton-control):where(.skeleton-control) {
    display: block;
    width: 96px;
    height: 34px;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--muted-2) 14%, var(--surface-inset));
  }
  :global(.skeleton-control.back):where(.skeleton-control) {
    width: 72px;
  }
  :global(.diagnostics-skeleton-summary):where(.diagnostics-skeleton-summary),
  :global(.diagnostics-skeleton-controls):where(.diagnostics-skeleton-controls),
  :global(.diagnostics-skeleton-rows):where(.diagnostics-skeleton-rows) {
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--panel);
  }
  :global(.diagnostics-skeleton-summary):where(.diagnostics-skeleton-summary) {
    min-height: 76px;
    padding: 14px 16px;
  }
  :global(.diagnostics-skeleton-summary):where(.diagnostics-skeleton-summary)
    > :global(.skeleton-copy) {
    width: min(520px, 58vw);
  }
  :global(.diagnostics-skeleton-actions):where(.diagnostics-skeleton-actions) {
    display: flex;
    gap: 8px;
  }
  :global(.diagnostics-skeleton-catalog):where(.diagnostics-skeleton-catalog) {
    width: 132px;
  }
  :global(.diagnostics-skeleton-controls):where(.diagnostics-skeleton-controls) {
    display: grid;
    grid-template-columns: minmax(190px, 1fr) 142px 126px 126px 104px;
    gap: 10px;
    padding: 14px;
  }
  :global(.diagnostics-skeleton-controls):where(.diagnostics-skeleton-controls) :global(span) {
    height: 38px;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--muted-2) 14%, var(--surface-inset));
  }
  :global(.diagnostics-skeleton-results):where(.diagnostics-skeleton-results) {
    width: 145px;
  }
  :global(.diagnostics-skeleton-rows):where(.diagnostics-skeleton-rows) :global(.skeleton-row) {
    grid-template-columns: 160px 180px minmax(0, 1fr);
  }
  @media (max-width: 900px) {
    :global(.diagnostics-skeleton-controls):where(.diagnostics-skeleton-controls) {
      grid-template-columns: 1fr 1fr;
    }
    :global(.diagnostics-skeleton-controls):where(.diagnostics-skeleton-controls)
      :global(span:first-child),
    :global(.diagnostics-skeleton-controls):where(.diagnostics-skeleton-controls)
      :global(span:last-child) {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 640px) {
    :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header)
      :global(.skeleton-copy),
    :global(.diagnostics-skeleton-summary):where(.diagnostics-skeleton-summary)
      > :global(.skeleton-copy) {
      width: 100%;
    }
    :global(.diagnostics-skeleton-header):where(.diagnostics-skeleton-header) {
      align-items: start;
    }
    :global(.diagnostics-skeleton-summary):where(.diagnostics-skeleton-summary) {
      align-items: stretch;
      flex-direction: column;
    }
    :global(.diagnostics-skeleton-actions):where(.diagnostics-skeleton-actions) {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    :global(.diagnostics-skeleton-actions):where(.diagnostics-skeleton-actions)
      :global(.skeleton-control) {
      width: 100%;
    }
    :global(.diagnostics-skeleton-rows):where(.diagnostics-skeleton-rows) :global(.skeleton-row) {
      grid-template-columns: 104px minmax(0, 1fr) 76px;
    }
  }
</style>
