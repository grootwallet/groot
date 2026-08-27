<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import QRCode from 'qrcode';
  import { onDestroy, tick } from 'svelte';

  let {
    frames,
    intervalMs = 1000,
    label = 'Animated QR',
    expandable = false
  } = $props<{
    frames: string[];
    intervalMs?: number;
    label?: string;
    expandable?: boolean;
  }>();
  let image = $state('');
  let index = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  let expanded = $state(false);
  let overlay = $state<HTMLDivElement>();
  let generation = 0;

  async function expand() {
    expanded = true;
    await tick();
    overlay?.focus();
  }

  async function render() {
    if (!frames.length) {
      image = '';
      return;
    }
    const currentGeneration = ++generation;
    const current = frames[index % frames.length];
    const rendered = await QRCode.toDataURL(current, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'L'
    });
    if (currentGeneration === generation) image = rendered;
  }

  $effect(() => {
    const frameCount = frames.length;
    const delay = intervalMs;
    index = 0;
    clearInterval(timer);
    if (frameCount > 1)
      timer = setInterval(() => {
        index = (index + 1) % frameCount;
      }, delay);
    return () => clearInterval(timer);
  });
  $effect(() => {
    frames;
    index;
    void render();
  });
  onDestroy(() => clearInterval(timer));
</script>

<div class="ur-qr" aria-live="polite">
  {#if image}
    {#if expandable}<button
        type="button"
        class="qr-button"
        aria-label={translate($locale, 'Enlarge {label}', { label: translate($locale, label) })}
        onclick={expand}
        ><img
          src={image}
          alt={translate($locale, `${label} frame {current} of {total}`, {
            current: index + 1,
            total: frames.length
          })}
        /></button
      >{:else}<img
        src={image}
        alt={translate($locale, `${label} frame {current} of {total}`, {
          current: index + 1,
          total: frames.length
        })}
      />{/if}
  {:else}<div class="placeholder">{translate($locale, 'Preparing QR…')}</div>{/if}
  <small
    >{translate(
      $locale,
      frames.length > 1 ? `Frame ${index + 1} of ${frames.length}` : 'Single frame'
    )}
    {translate($locale, '· keep the scanner\n    steady')}</small
  >
</div>

{#if expanded}
  <div
    bind:this={overlay}
    class="qr-overlay"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={translate($locale, 'Enlarged {label}', { label: translate($locale, label) })}
    onkeydown={(event) => {
      if (event.key === 'Escape') expanded = false;
    }}
  >
    <button
      type="button"
      class="qr-overlay-close"
      aria-label={translate($locale, 'Close enlarged QR')}
      onclick={() => (expanded = false)}>{translate($locale, 'Close')}</button
    >
    <img src={image} alt={translate($locale, label)} />
    <small>{translate($locale, `Frame ${index + 1} of ${frames.length}`)}</small>
  </div>
{/if}

<style>
  .ur-qr {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
  }
  .ur-qr img,
  .qr-button,
  .placeholder {
    width: min(420px, 78vw);
    aspect-ratio: 1;
    border-radius: 1rem;
    background: #fff;
    padding: 0.75rem;
  }
  .qr-button {
    display: block;
    border: 0;
    cursor: zoom-in;
  }
  .qr-button img {
    width: 100%;
    padding: 0;
  }
  .placeholder {
    display: grid;
    place-items: center;
    color: #111;
  }
  .ur-qr small {
    color: var(--muted);
  }
  .qr-overlay {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 1rem;
    padding: max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom));
    color: #fff;
    background: rgba(0, 0, 0, 0.94);
  }
  .qr-overlay img {
    width: min(94vw, 84dvh);
    aspect-ratio: 1;
    padding: 0.8rem;
    border-radius: 1rem;
    background: #fff;
  }
  .qr-overlay-close {
    position: fixed;
    top: max(1rem, env(safe-area-inset-top));
    right: 1rem;
    min-width: 4.5rem;
    min-height: 2.75rem;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 999px;
    color: #fff;
    background: rgba(20, 20, 20, 0.78);
  }
  .qr-overlay small {
    color: rgba(255, 255, 255, 0.8);
  }
</style>
