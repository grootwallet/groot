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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.permanent-label-tags):where(.permanent-label-tags) {
    min-width: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    list-style: none;
  }
  :global(.permanent-label-tag):where(.permanent-label-tag),
  :global(.permanent-label-tags-hidden):where(.permanent-label-tags-hidden) {
    width: fit-content;
    max-width: min(180px, 100%);
    padding: 3px 6px;
    overflow: hidden;
    color: var(--text-soft) !important;
    background: color-mix(in srgb, var(--fr-blue) 8%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--link) 24%, var(--border));
    border-radius: 5px;
    font-size: var(--font-size-meta) !important;
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.permanent-label-tags-hidden):where(.permanent-label-tags-hidden) {
    color: var(--muted) !important;
  }
  :global(.permanent-label-tags.prominent):where(.permanent-label-tags) {
    justify-content: flex-end;
  }
  :global(.permanent-label-tags.prominent):where(.permanent-label-tags)
    :global(.permanent-label-tag) {
    max-width: min(220px, 100%);
    padding: 5px 8px;
    border-radius: 6px;
    font-size: var(--font-size-meta) !important;
  }
</style>
