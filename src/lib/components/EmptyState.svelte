<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    description,
    compact = false,
    icon,
    children
  } = $props<{
    title: string;
    description: string;
    compact?: boolean;
    icon?: Snippet;
    children?: Snippet;
  }>();
</script>

<section class:compact class="empty-state" aria-live="polite">
  {#if icon}<span class="empty-icon">{@render icon()}</span>{/if}
  <h2>{title}</h2>
  <p>{description}</p>
  {@render children?.()}
</section>
