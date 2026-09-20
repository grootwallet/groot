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
