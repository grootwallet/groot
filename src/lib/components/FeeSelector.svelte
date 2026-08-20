<script lang="ts">
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
  <span>Network fee</span>
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
        ><span><strong>{option.name}</strong></span><b
          >{estimates ? `${option.rate} sat/vB` : 'Unavailable'}</b
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
      ><span><strong>Custom</strong><small>Set rate</small></span>{#if customActive}<input
          aria-label="Custom fee rate"
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
    {#if estimates}Estimated fee <Amount value={estimatedFee} /> · {estimates.source}{:else}Estimate
      unavailable · Enter a custom rate{/if}
  </span>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
</div>
