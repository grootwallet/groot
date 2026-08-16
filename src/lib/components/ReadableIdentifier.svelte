<script lang="ts">
  import { Check, Copy } from '@lucide/svelte';
  import { groupIdentifierForDisplay } from '$lib/address-display';

  let {
    value,
    label,
    copied = false,
    oncopy
  } = $props<{
    value: string;
    label: string;
    copied?: boolean;
    oncopy: () => void | Promise<void>;
  }>();
  let groups = $derived(groupIdentifierForDisplay(value));
</script>

<div class="readable-address-block">
  <button
    type="button"
    class="readable-address"
    aria-label={`Copy exact ${label}`}
    onclick={oncopy}
  >
    <span class="readable-address-groups" aria-hidden="true">
      {#each groups as group, index}
        <span class:edge={index < 2 || index >= groups.length - 2}>{group}</span>
      {/each}
    </span>
    <span class="sr-only">{value}</span>
    {#if copied}<Check size={17} />{:else}<Copy size={17} />{/if}
  </button>
  <p>Spaces are visual only. Copy always uses the exact value.</p>
</div>
