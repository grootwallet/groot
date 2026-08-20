<script lang="ts">
  import { amountUnit, denomination, formatAmount } from '$lib/denomination';
  let {
    value,
    sign = '',
    hidden = false,
    unit = true
  } = $props<{ value: number; sign?: string; hidden?: boolean; unit?: boolean }>();
</script>

<span class="formatted-amount">
  <strong>{hidden ? '••••••' : `${sign}${formatAmount(value, $denomination)}`}</strong
  >{#if unit}{' '}<small>{amountUnit($denomination)}</small>{/if}
</span>
