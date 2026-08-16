<script lang="ts">
  import { Check, Copy } from '@lucide/svelte';
  import { groupAddressForDisplay } from '$lib/address-display';

  type Props = {
    address: string;
    copied?: boolean;
    oncopy: () => void | Promise<void>;
  };

  let { address, copied = false, oncopy }: Props = $props();
  let groups = $derived(groupAddressForDisplay(address));
</script>

<div class="readable-address-block">
  <button type="button" class="readable-address" aria-label="Copy exact address" onclick={oncopy}>
    <span class="readable-address-groups" aria-hidden="true">
      {#each groups as group, index}
        <span class:edge={index < 2 || index >= groups.length - 2}>{group}</span>
      {/each}
    </span>
    <span class="sr-only">{address}</span>
    {#if copied}<Check size={17} />{:else}<Copy size={17} />{/if}
  </button>
  <p>Spaces are visual only. Copy always uses the exact address.</p>
</div>
