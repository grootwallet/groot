<script lang="ts">
  let { variant = 'transactions', count = 3 } = $props<{
    variant?: 'balance' | 'transactions' | 'coins';
    count?: number;
  }>();
</script>

<div
  class="wallet-skeleton {variant}"
  role="status"
  aria-label="Loading wallet data"
  aria-live="polite"
>
  <span class="sr-only">Loading wallet data…</span>
  {#if variant === 'balance'}
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
