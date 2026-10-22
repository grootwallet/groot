<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';

  let {
    text,
    truncatedSelector = '',
    positionSelector = '',
    children
  } = $props<{
    text: string;
    truncatedSelector?: string;
    positionSelector?: string;
    children: Snippet;
  }>();
  let root: HTMLSpanElement;
  let open = $state(false);
  let left = $state(0);
  let top = $state(0);
  let below = $state(false);
  let positionFrame: number | null = null;

  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  function hide() {
    if (positionFrame !== null) cancelAnimationFrame(positionFrame);
    positionFrame = null;
    open = false;
  }

  function position() {
    const target = truncatedSelector ? root.querySelector<HTMLElement>(truncatedSelector) : root;
    if (!target || (truncatedSelector && target.scrollWidth <= target.clientWidth)) {
      hide();
      return;
    }
    const positionTarget = positionSelector
      ? root.querySelector<HTMLElement>(positionSelector)
      : target;
    if (!positionTarget) {
      hide();
      return;
    }
    const rect = positionTarget.getBoundingClientRect();
    left = Math.max(138, Math.min(rect.left + rect.width / 2, window.innerWidth - 138));
    below = rect.top < 72;
    top = below ? rect.bottom + 8 : rect.top - 8;
    open = true;
  }

  function show() {
    if (positionFrame !== null) cancelAnimationFrame(positionFrame);
    // Focus can scroll a mobile page. Measure after that scroll settles.
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      position();
    });
  }

  $effect(() => {
    if (!open) return;
    const refresh = () => {
      if (positionFrame !== null) cancelAnimationFrame(positionFrame);
      positionFrame = requestAnimationFrame(() => {
        positionFrame = null;
        position();
      });
    };
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  });

  onDestroy(hide);
</script>

<span
  class="tooltip-anchor"
  role="group"
  bind:this={root}
  onpointerenter={show}
  onpointerleave={hide}
  onfocusin={show}
  onfocusout={hide}
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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.tooltip-anchor):where(.tooltip-anchor) {
    display: block;
    min-width: 0;
  }
</style>
