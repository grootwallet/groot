<script lang="ts">
  import { presentLocalTimestamp } from '$lib/date-time';

  let { value }: { value: string } = $props();
  let timestamp = $derived(presentLocalTimestamp(value));
</script>

{#if timestamp.dateTime}
  <time datetime={timestamp.dateTime} title={timestamp.detail}>{timestamp.display}</time>
{:else}
  <span title={timestamp.detail}>{timestamp.display}</span>
{/if}
