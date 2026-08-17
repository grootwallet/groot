<script lang="ts">
  import { bitcoinAmountParts, denomination, formatAmount } from '$lib/denomination';
  let {
    value,
    sign = '',
    hidden = false,
    unit = true
  } = $props<{ value: number; sign?: string; hidden?: boolean; unit?: boolean }>();
  let bitcoin = $derived(bitcoinAmountParts(value));
</script>

<span class="formatted-amount">
  {#if hidden}<strong>••••••</strong>{:else if $denomination === 'btc'}<span class="amount-quiet"
      >{sign}{bitcoin.quiet}</span
    ><strong>{bitcoin.strong}</strong>{:else}<strong>{sign}{formatAmount(value, 'sats')}</strong
    >{/if}{#if unit}{' '}<small>{$denomination === 'btc' ? 'BTC' : 'sats'}</small>{/if}
</span>
