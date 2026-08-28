<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

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
  let finePointer = $state(true);

  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  function show(): boolean {
    const target = truncatedSelector ? root.querySelector<HTMLElement>(truncatedSelector) : root;
    if (!target || (truncatedSelector && target.scrollWidth <= target.clientWidth)) {
      open = false;
      return false;
    }
    const positionTarget = positionSelector
      ? root.querySelector<HTMLElement>(positionSelector)
      : target;
    if (!positionTarget) {
      open = false;
      return false;
    }
    const rect = positionTarget.getBoundingClientRect();
    left = Math.max(138, Math.min(rect.left + rect.width / 2, window.innerWidth - 138));
    below = rect.top < 72;
    top = below ? rect.bottom + 8 : rect.top - 8;
    open = true;
    return true;
  }

  onMount(() => {
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    const updatePointer = () => {
      finePointer = media.matches;
      if (finePointer) open = false;
    };
    const closeOutside = (event: PointerEvent) => {
      if (open && event.target instanceof Node && !root.contains(event.target)) open = false;
    };
    updatePointer();
    media.addEventListener('change', updatePointer);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      media.removeEventListener('change', updatePointer);
      document.removeEventListener('pointerdown', closeOutside);
    };
  });
</script>

<span
  class="tooltip-anchor"
  role="group"
  bind:this={root}
  onpointerenter={() => finePointer && show()}
  onpointerleave={() => finePointer && (open = false)}
  onfocusin={() => finePointer && show()}
  onfocusout={() => finePointer && (open = false)}
  onclickcapture={(event) => {
    if (!finePointer) {
      if (open) open = false;
      else if (show()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }}
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
