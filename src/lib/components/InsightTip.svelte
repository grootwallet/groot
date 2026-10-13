<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Info } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  let { text, label = '' } = $props<{ text: string; label?: string }>();
  let open = $state(false);
  let hovered = $state(false);
  let focused = $state(false);
  let finePointer = $state(true);
  let root: HTMLSpanElement | null = null;
  let trigger: HTMLButtonElement | null = null;
  let left = $state(0);
  let top = $state(0);
  let below = $state(false);
  let visible = $derived(open || (finePointer && (hovered || focused)));

  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  function positionTooltip() {
    if (!finePointer || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    left = Math.max(138, Math.min(rect.left + rect.width / 2, window.innerWidth - 138));
    below = rect.top < 90;
    top = below ? rect.bottom + 8 : rect.top - 8;
  }

  function toggleTooltip() {
    if (visible) {
      open = false;
      hovered = false;
      focused = false;
      trigger?.blur();
      return;
    }
    open = true;
  }

  $effect(() => {
    if (!visible) return;
    void tick().then(positionTooltip);
  });

  onMount(() => {
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    const updatePointer = () => {
      finePointer = media.matches;
      open = false;
    };
    const closeOutside = (event: PointerEvent) => {
      if (open && event.target instanceof Node && !root?.contains(event.target)) open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    updatePointer();
    media.addEventListener('change', updatePointer);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', positionTooltip);
    window.addEventListener('scroll', positionTooltip, true);
    return () => {
      media.removeEventListener('change', updatePointer);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', positionTooltip, true);
    };
  });
</script>

<span class="insight-tip" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    aria-label={label || translate($locale, 'More information')}
    aria-expanded={open}
    onpointerenter={() => (hovered = true)}
    onpointerleave={() => (hovered = false)}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    onclick={toggleTooltip}
  >
    <Info size={14} />
  </button>
  {#if visible}<span
      class="ui-tooltip insight-tooltip"
      class:below
      class:mobile={!finePointer}
      role="tooltip"
      use:portal
      style:left={finePointer ? `${left}px` : undefined}
      style:top={finePointer ? `${top}px` : undefined}>{text}</span
    >{/if}
</span>
