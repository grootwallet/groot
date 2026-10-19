<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Gauge } from '@lucide/svelte';
  import Amount from './Amount.svelte';
  import type { FeeEstimates } from '$lib/wallet';

  let {
    estimates,
    value,
    estimatedFee,
    error = '',
    onchange
  } = $props<{
    estimates: FeeEstimates | null;
    value: number;
    estimatedFee: number;
    error?: string;
    onchange: (value: number) => void;
  }>();
  let custom = $state('');
  let customChosen = $state(false);
  let options = $derived([
    { name: 'Economy', rate: Number(estimates?.economy ?? 0) },
    { name: 'Standard', rate: Number(estimates?.standard ?? 0) },
    { name: 'Priority', rate: Number(estimates?.priority ?? 0) }
  ]);
  let customActive = $derived(
    customChosen || !options.some((option) => option.rate > 0 && option.rate === value)
  );
</script>

<div class="field fee-selector">
  <span>{translate($locale, 'Network fee')}</span>
  <div class="fee-options">
    {#each options as option}
      <button
        type="button"
        class:active={!customActive && value === option.rate}
        disabled={!estimates}
        onclick={() => {
          customChosen = false;
          onchange(option.rate);
        }}
        ><span><strong>{translate($locale, option.name)}</strong></span><b
          >{translate($locale, estimates ? `${option.rate} sat/vB` : 'Unavailable')}</b
        ></button
      >
    {/each}
    <button
      type="button"
      class:active={customActive}
      onclick={() => {
        customChosen = true;
        onchange(Number(custom || 0));
      }}
      ><span
        ><strong>{translate($locale, 'Custom')}</strong><small
          >{translate($locale, 'Set rate')}</small
        ></span
      >{#if customActive}<input
          aria-label={translate($locale, 'Custom fee rate')}
          value={custom || (value ? String(value) : '')}
          onclick={(event) => event.stopPropagation()}
          oninput={(event) => {
            custom = event.currentTarget.value;
            onchange(Number(custom || 0));
          }}
          inputmode="decimal"
          placeholder="0"
        />{:else}<Gauge size={17} />{/if}</button
    >
  </div>
  <span class="fee-source">
    {#if estimates}{translate($locale, 'Estimated fee')}
      <Amount value={estimatedFee} />{:else}{translate(
        $locale,
        'Estimate\n      unavailable · Enter a custom rate'
      )}{/if}
  </span>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
</div>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.fee-options):where(.fee-options) :global(input) {
    width: 100%;
    color: var(--text);
    background: var(--surface-control);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    outline: none;
    padding: 0 12px;
  }
  :global(.fee-options):where(.fee-options) :global(input:focus) {
    border-color: var(--border-strong);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--link) 18%, transparent);
  }
  :global(.fee-options):where(.fee-options) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
  }

  :global(.fee-source):where(.fee-source) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.fee-options):where(.fee-options) :global(button) {
    min-height: 61px;
    border: 1px solid var(--border);
    background: var(--surface-control);
    border-radius: var(--radius-control);
    padding: 9px 10px;
    color: inherit;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-align: left;
    cursor: pointer;
  }
  :global(.fee-options):where(.fee-options) :global(button.active) {
    border-color: var(--border-strong);
    background: var(--surface-active);
  }
  :global(.fee-options):where(.fee-options) :global(button span) {
    display: flex;
    width: 100%;
    justify-content: space-between;
    gap: 4px;
  }
  :global(.fee-options):where(.fee-options) :global(strong) {
    font-size: 14px;
  }
  :global(.fee-options):where(.fee-options) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.fee-options):where(.fee-options) :global(b) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    font-weight: 500;
  }
  :global(.fee-options):where(.fee-options) :global(button:last-child) {
    grid-column: 1 / -1;
    min-height: 46px;
    flex-direction: row;
    align-items: center;
  }
  :global(.fee-options):where(.fee-options) :global(button:last-child span) {
    flex-direction: column;
  }
  :global(.fee-options):where(.fee-options) :global(input) {
    width: 90px;
    height: 31px;
  }

  @media (max-width: 760px) {
    :global(.fee-options):where(.fee-options) {
      grid-template-columns: 1fr;
    }
    :global(.fee-options):where(.fee-options) :global(button:last-child) {
      grid-column: auto;
    }
  }
</style>
