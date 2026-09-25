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
