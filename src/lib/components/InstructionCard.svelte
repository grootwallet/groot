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
