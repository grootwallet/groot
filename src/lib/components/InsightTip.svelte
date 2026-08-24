<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Info } from '@lucide/svelte';
  import { onMount } from 'svelte';
  let { text, label = '' } = $props<{ text: string; label?: string }>();
  let open = $state(false);
  let finePointer = $state(true);
  let root: HTMLSpanElement | null = null;

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

<span class="insight-tip" class:open bind:this={root}>
  <button
    type="button"
    aria-label={label || translate($locale, 'More information')}
    aria-expanded={finePointer ? undefined : open}
    onclick={(event) => {
      if (finePointer) event.currentTarget.blur();
      else open = !open;
    }}
  >
    <Info size={14} />
  </button>
  <span role="tooltip">{text}</span>
</span>
