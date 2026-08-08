<script lang="ts">
  import QRCode from 'qrcode';
  import { onDestroy } from 'svelte';

  let { frames, intervalMs = 250 } = $props<{ frames: string[]; intervalMs?: number }>();
  let image = $state('');
  let index = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  let generation = 0;

  async function render() {
    if (!frames.length) { image = ''; return; }
    const currentGeneration = ++generation;
    const current = frames[index % frames.length];
    const rendered = await QRCode.toDataURL(current, { width: 420, margin: 2, errorCorrectionLevel: 'L' });
    if (currentGeneration === generation) image = rendered;
  }

  $effect(() => {
    const frameCount = frames.length;
    const delay = intervalMs;
    index = 0;
    clearInterval(timer);
    if (frameCount > 1) timer = setInterval(() => { index = (index + 1) % frameCount; }, delay);
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
  {#if image}<img src={image} alt="Animated crypto-psbt QR frame {index + 1} of {frames.length}" />{:else}<div class="placeholder">Preparing QR…</div>{/if}
  <small>{frames.length > 1 ? `Frame ${index + 1} of ${frames.length}` : 'Single frame'} · keep the scanner steady</small>
</div>

<style>
  .ur-qr{display:grid;justify-items:center;gap:.75rem}.ur-qr img,.placeholder{width:min(420px,78vw);aspect-ratio:1;border-radius:1rem;background:#fff;padding:.75rem}.placeholder{display:grid;place-items:center;color:#111}.ur-qr small{color:var(--muted)}
</style>
