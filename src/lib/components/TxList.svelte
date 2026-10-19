<script lang="ts">
  import { ArrowDownLeft, ArrowUpRight, ChevronRight, Clock3, Replace } from '@lucide/svelte';
  import Amount from './Amount.svelte';
  import type { Transaction } from '$lib/types';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import { formatConfirmationCount, locale, t } from '$lib/i18n';
  import { discreetMode } from '$lib/privacy';
  import { fly } from 'svelte/transition';
  import WalletSkeleton from './WalletSkeleton.svelte';
  import { translate } from '$lib/i18n-catalog';
  import PermanentLabelTags from './PermanentLabelTags.svelte';
  let {
    items,
    loading = false,
    onselect = () => {}
  } = $props<{ items: Transaction[]; loading?: boolean; onselect?: (tx: Transaction) => void }>();
</script>

{#if loading}
  <WalletSkeleton variant="transactions" />
{:else}
  <div class="tx-list">
    {#each items as tx, index (tx.id)}
      <button
        class="tx-row"
        class:pending={tx.status === 'pending'}
        class:replaced={tx.status === 'replaced'}
        class:replacement={Boolean(tx.rbfHistory)}
        onclick={() => onselect(tx)}
        in:fly={{ y: 5, duration: 180, delay: Math.min(index * 24, 96) }}
      >
        <span
          class="tx-icon"
          class:received={tx.direction === 'received'}
          class:pending={tx.status === 'pending'}
          class:replaced={tx.status === 'replaced'}
        >
          {#if tx.rbfHistory}<Replace size={17} />{:else if tx.status === 'pending'}<Clock3
              size={17}
            />{:else if tx.status === 'replaced'}<Replace
              size={17}
            />{:else if tx.direction === 'received'}<ArrowDownLeft size={17} />{:else}<ArrowUpRight
              size={17}
            />{/if}
        </span>
        <span class="tx-main"
          ><PermanentLabelTags
            labels={tx.direction === 'received' && tx.provenance.labels.length
              ? tx.provenance.labels
              : tx.intentLabel
                ? [tx.intentLabel]
                : [tx.label]}
            hidden={$discreetMode}
            prominent
          /><small
            ><LocalTimestamp value={tx.date} />{' · '}{tx.rbfHistory
              ? `${translate($locale, 'Fee increased')} · ${
                  tx.status === 'pending'
                    ? t('awaitingConfirmation', $locale)
                    : formatConfirmationCount(tx.confirmations, $locale)
                }`
              : translate(
                  $locale,
                  tx.status === 'pending'
                    ? t('unconfirmed', $locale)
                    : tx.status === 'replaced'
                      ? t('replaced', $locale)
                      : formatConfirmationCount(tx.confirmations, $locale)
                )}</small
          ></span
        >
        <span
          class="tx-amount"
          class:positive={tx.direction === 'received' && tx.status === 'confirmed'}
          ><strong
            ><Amount
              value={tx.amount}
              sign={tx.direction === 'received' ? '+' : '−'}
              hidden={$discreetMode}
            /></strong
          ><small
            >{tx.status === 'replaced'
              ? t('notCounted', $locale)
              : tx.kind === 'self_spend'
                ? translate($locale, 'Network fee')
                : tx.status === 'pending'
                  ? t('awaitingConfirmation', $locale)
                  : t('confirmed', $locale)}</small
          ></span
        >
        <ChevronRight class="tx-chevron" size={16} />
      </button>
    {/each}
  </div>
{/if}

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.tx-list):where(.tx-list) {
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    overflow: hidden;
  }
  :global(.tx-row):where(.tx-row) {
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    min-height: 72px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto 18px;
    gap: 12px;
    align-items: center;
    padding: 0 16px;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      box-shadow 0.16s ease;
  }
  :global(.tx-row:last-child):where(.tx-row) {
    border-bottom: 0;
  }
  :global(.tx-row:hover):where(.tx-row) {
    background: var(--panel-2);
  }
  :global(.tx-row:focus-visible):where(.tx-row) {
    /* Keep focus visible inside the shared rounded, clipped list container. */
    outline: 2px solid var(--focus);
    outline-offset: -3px;
  }
  :global(.tx-row.pending):where(.tx-row) {
    background: color-mix(in srgb, var(--accent-soft) 46%, var(--panel));
    box-shadow: inset 3px 0 0 color-mix(in srgb, var(--accent) 72%, transparent);
  }
  :global(.tx-row.pending:hover):where(.tx-row) {
    background: color-mix(in srgb, var(--accent-soft) 70%, var(--panel));
  }
  :global(.tx-row.pending):where(.tx-row) :global(.tx-amount strong) {
    color: var(--text-soft);
  }
  :global(.tx-icon.pending):where(.tx-icon) {
    color: var(--accent);
    background: var(--accent-soft);
  }
  :global(.tx-row.replaced):where(.tx-row) {
    opacity: 0.72;
  }
  :global(.tx-row.replaced):where(.tx-row) :global(.tx-amount strong) {
    text-decoration: line-through;
    color: var(--muted);
  }
  :global(.tx-icon.replaced):where(.tx-icon) {
    color: var(--muted);
    background: var(--surface-icon);
  }
  :global(.tx-icon):where(.tx-icon) {
    width: 34px;
    height: 34px;
    background: var(--surface-icon);
    color: var(--muted);
    border-radius: var(--radius-control);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.tx-icon.received):where(.tx-icon) {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 9%, transparent);
  }
  :global(.tx-main):where(.tx-main),
  :global(.tx-amount):where(.tx-amount) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  :global(.tx-main):where(.tx-main) :global(strong),
  :global(.tx-amount):where(.tx-amount) :global(strong) {
    font-size: 15px;
    font-weight: 550;
  }
  :global(.tx-main):where(.tx-main) > :global(small),
  :global(.tx-amount):where(.tx-amount) > :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    text-transform: capitalize;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.tx-main):where(.tx-main) :global(.permanent-label-tags.prominent) {
    justify-content: flex-start;
  }
  :global(.tx-amount):where(.tx-amount) {
    text-align: right;
  }
  :global(.tx-amount.positive):where(.tx-amount) :global(strong) {
    color: var(--success) !important;
  }
  :global(.tx-row):where(.tx-row) :global(.tx-chevron) {
    transition:
      color 0.16s ease,
      transform 0.16s ease;
  }
  :global(.tx-row:hover):where(.tx-row) :global(.tx-chevron) {
    color: var(--link);
    transform: translateX(2px);
  }

  @media (max-width: 760px) {
    :global(.tx-row):where(.tx-row) {
      padding: 0 12px;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 10px;
    }
    :global(.tx-main):where(.tx-main) :global(small) {
      max-width: 145px;
    }
    :global(.tx-amount):where(.tx-amount) :global(strong) {
      font-size: var(--font-size-meta);
    }
  }
</style>
