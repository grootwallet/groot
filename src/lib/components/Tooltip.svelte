<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    text,
    truncatedSelector = '',
    children
  } = $props<{
    text: string;
    truncatedSelector?: string;
    children: Snippet;
  }>();
  let root: HTMLSpanElement;
  let open = $state(false);
  let left = $state(0);
  let top = $state(0);
  let below = $state(false);

  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  function show() {
    const target = truncatedSelector ? root.querySelector<HTMLElement>(truncatedSelector) : root;
    if (!target || (truncatedSelector && target.scrollWidth <= target.clientWidth)) {
      open = false;
      return;
    }
    const rect = target.getBoundingClientRect();
    left = Math.max(138, Math.min(rect.left + rect.width / 2, window.innerWidth - 138));
    below = rect.top < 72;
    top = below ? rect.bottom + 8 : rect.top - 8;
    open = true;
  }
</script>

<span
  class="tooltip-anchor"
  role="group"
  bind:this={root}
  onpointerenter={show}
  onpointerleave={() => (open = false)}
  onfocusin={show}
  onfocusout={() => (open = false)}
>
  {@render children()}
  {#if open}<span
      class="ui-tooltip"
      class:below
      role="tooltip"
      use:portal
      style:left={`${left}px`}
      style:top={`${top}px`}>{text}</span
    >{/if}
</span>
