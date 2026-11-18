<script lang="ts">
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import Button from '$lib/components/Button.svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { createQrCamera, cameraError } from '$lib/qr-camera';
  import { Camera } from '@lucide/svelte';
  import { onDestroy } from 'svelte';

  let { onscan } = $props<{ onscan: (value: string) => void | Promise<void> }>();
  let video: HTMLVideoElement;
  let error = $state('');
  let processing = $state(false);
  let starting = $state(false);
  let cameraActive = $state(false);
  let scanner: ReturnType<typeof createQrCamera> | undefined;
  let stopped = false;
  const seen = new Set<string>();

  async function accept(value: string) {
    const exact = value.trim();
    if (!exact || processing || stopped || seen.has(exact)) return;
    if (exact.length > 8 * 1024) {
      error = 'This payment request is too large to scan safely.';
      return;
    }
    seen.add(exact);
    processing = true;
    try {
      await onscan(exact);
    } finally {
      processing = false;
    }
  }

  async function startCamera() {
    if (starting || stopped) return;
    starting = true;
    error = '';
    scanner?.destroy();
    scanner = createQrCamera(video, (value) => void accept(value));
    try {
      cameraActive = await scanner.start();
    } catch (cause) {
      if (stopped) return;
      error = cameraError(
        cause,
        'No usable camera is available. Connect a camera or enter the payment request manually.'
      );
    } finally {
      starting = false;
    }
  }

  onDestroy(() => {
    stopped = true;
    scanner?.destroy();
  });
</script>

<div class="scanner">
  <div class="camera-frame">
    <video
      bind:this={video}
      muted
      playsinline
      aria-label={translate($locale, 'Payment QR camera preview')}
    ></video>
    <div class="scan-guide" aria-hidden="true"></div>
  </div>
  <div class="scan-controls">
    {#if error}<WarningNotice
        tone="danger"
        icon
        role="alert"
        body={translate($locale, error)}
      />{:else}
      <div class="scan-status" role="status">
        <Camera size={16} /><span
          >{translate(
            $locale,
            starting
              ? 'Requesting camera permission…'
              : !cameraActive
                ? 'Allow camera access to scan this QR.'
                : processing
                  ? 'Reading payment request…'
                  : 'Point the camera at a Bitcoin payment QR'
          )}</span
        >
      </div>
    {/if}
    {#if !cameraActive}
      <Button class="full" loading={starting} onclick={startCamera}>
        {translate($locale, error ? 'Try camera again' : 'Allow camera')}
      </Button>
    {/if}
  </div>
</div>

<style>
  .scanner {
    position: relative;
    display: grid;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    container-type: inline-size;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0.75rem;
    justify-items: center;
  }
  .camera-frame {
    position: relative;
    height: min(100%, 100cqw);
    width: auto;
    max-width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 1rem;
    background: #05070a;
  }
  .scanner video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .scan-guide {
    position: absolute;
    width: 68%;
    aspect-ratio: 1;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border: 2px solid color-mix(in srgb, var(--link) 75%, white);
    border-radius: 1rem;
    pointer-events: none;
  }
  .scan-controls {
    display: grid;
    gap: 0.75rem;
    width: 100%;
  }
  .scan-status {
    display: flex;
    justify-self: stretch;
    align-items: flex-start;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.875rem;
  }
  .scan-status :global(svg) {
    flex: none;
    margin-top: 0.1rem;
  }
</style>
