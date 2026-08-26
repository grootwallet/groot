<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import type { PermanentLabel } from '$lib/types';

  let {
    labels,
    hidden = false,
    prominent = false
  }: {
    labels: readonly (PermanentLabel | string)[];
    hidden?: boolean;
    prominent?: boolean;
  } = $props();

  let uniqueLabels = $derived(
    [
      ...new Map(
        labels.map((label) => {
          const text = typeof label === 'string' ? label : label.text;
          const key =
            typeof label === 'string'
              ? `text:${text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`
              : `id:${label.id}`;
          return [key, text] as const;
        })
      ).values()
    ].filter(Boolean)
  );
</script>

{#if labels.length}
  {#if hidden}
    <span class="permanent-label-tags-hidden">{translate($locale, 'Labels hidden')}</span>
  {:else}
    <ul
      class="permanent-label-tags"
      class:prominent
      aria-label={translate($locale, 'Assigned labels')}
    >
      {#each uniqueLabels as label (label)}
        <li class="permanent-label-tag" title={label}>{label}</li>
      {/each}
    </ul>
  {/if}
{/if}
