<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    steps = [],
    children
  } = $props<{
    title: string;
    steps?: string[];
    children?: Snippet;
  }>();
</script>

<section class="instruction-card">
  <strong>{title}</strong>
  {#if steps.length}
    <ol>
      {#each steps as step}<li>{step}</li>{/each}
    </ol>
  {/if}
  {@render children?.()}
</section>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.instruction-card):where(.instruction-card) {
    display: grid;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.instruction-card):where(.instruction-card) > :global(strong) {
    font-size: 14px;
  }
  :global(.instruction-card):where(.instruction-card) :global(ol) {
    margin: 2px 0;
    padding-left: 20px;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    line-height: 1.55;
  }
  :global(.instruction-card):where(.instruction-card) :global(li + li) {
    margin-top: 4px;
  }
</style>
