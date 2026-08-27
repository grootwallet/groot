<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Info } from '@lucide/svelte';
  import { onMount } from 'svelte';
  let { text, label = '' } = $props<{ text: string; label?: string }>();
  let open = $state(false);
  let finePointer = $state(true);
  let root: HTMLSpanElement | null = null;
  let left = $state(0);
  let top = $state(0);
  let below = $state(false);

  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  function show() {
    const button = root?.querySelector('button');
    if (!button) return;
    const rect = button.getBoundingClientRect();
    left = Math.max(151, Math.min(rect.left + rect.width / 2, window.innerWidth - 151));
    below = rect.top < 130;
    top = below ? rect.bottom + 8 : rect.top - 8;
    open = true;
  }

  onMount(() => {
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    const updatePointer = () => {
      finePointer = media.matches;
      if (finePointer) open = false;
    };
    const closeOutside = (event: PointerEvent) => {
      if (open && event.target instanceof Node && !root?.contains(event.target)) open = false;
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
  class="insight-tip"
  role="group"
  class:open
  bind:this={root}
  onpointerenter={() => finePointer && show()}
  onpointerleave={() => finePointer && (open = false)}
>
  <button
    type="button"
    aria-label={label || translate($locale, 'More information')}
    aria-expanded={finePointer ? undefined : open}
    onclick={(event) => {
      if (finePointer) event.currentTarget.blur();
      else if (open) open = false;
      else show();
    }}
    onfocus={() => finePointer && show()}
    onblur={() => finePointer && (open = false)}
  >
    <Info size={14} />
  </button>
  {#if open}<span
      class="insight-tip-popover"
      class:below
      role="tooltip"
      use:portal
      style:left={`${left}px`}
      style:top={`${top}px`}>{text}</span
    >{/if}
</span>
