<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import type { PermanentLabel } from '$lib/types';

  let { labels, hidden = false }: { labels: readonly PermanentLabel[]; hidden?: boolean } =
    $props();

  let uniqueLabels = $derived([...new Map(labels.map((label) => [label.id, label])).values()]);
</script>

{#if labels.length}
  {#if hidden}
    <span class="permanent-label-tags-hidden">{translate($locale, 'Labels hidden')}</span>
  {:else}
    <ul class="permanent-label-tags" aria-label={translate($locale, 'Permanent labels')}>
      {#each uniqueLabels as label (label.id)}
        <li class="permanent-label-tag" title={label.text}>{label.text}</li>
      {/each}
    </ul>
  {/if}
{/if}
