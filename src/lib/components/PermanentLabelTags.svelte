<script lang="ts">
  import type { PermanentLabel } from '$lib/types';

  let { labels, hidden = false }: { labels: readonly PermanentLabel[]; hidden?: boolean } =
    $props();

  let uniqueLabels = $derived([...new Map(labels.map((label) => [label.id, label])).values()]);
</script>

{#if labels.length}
  {#if hidden}
    <span class="permanent-label-tags-hidden">Labels hidden</span>
  {:else}
    <ul class="permanent-label-tags" aria-label="Permanent labels">
      {#each uniqueLabels as label (label.id)}
        <li class="permanent-label-tag" title={label.text}>{label.text}</li>
      {/each}
    </ul>
  {/if}
{/if}
