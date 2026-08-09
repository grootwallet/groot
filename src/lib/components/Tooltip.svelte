<script lang="ts">
  import type { Snippet } from 'svelte';

  let { text, truncatedSelector = '', children } = $props<{
    text: string;
    truncatedSelector?: string;
    children: Snippet;
  }>();
  let root: HTMLSpanElement;
  let open = $state(false);
  let left = $state(0);
  let top = $state(0);

  function show() {
    const target = truncatedSelector ? root.querySelector<HTMLElement>(truncatedSelector) : root;
    if (!target || (truncatedSelector && target.scrollWidth <= target.clientWidth)) { open = false; return; }
    const rect = root.getBoundingClientRect();
    left = Math.max(8, Math.min(rect.right + 8, window.innerWidth - 268));
    top = rect.top + rect.height / 2;
    open = true;
  }
</script>

<span class="tooltip-anchor" role="group" bind:this={root} onpointerenter={show} onpointerleave={() => open=false} onfocusin={show} onfocusout={() => open=false}>
  {@render children()}
  {#if open}<span class="ui-tooltip" role="tooltip" style:left={`${left}px`} style:top={`${top}px`}>{text}</span>{/if}
</span>
