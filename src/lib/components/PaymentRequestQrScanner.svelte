<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Camera, CameraOff } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import QrScanner from 'qr-scanner';

  let { onscan } = $props<{ onscan: (value: string) => void | Promise<void> }>();
  let video: HTMLVideoElement;
  let error = $state('');
  let processing = $state(false);

  onMount(() => {
    let scanner: QrScanner | undefined;
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

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
        scanner = new QrScanner(video, (result) => void accept(result.data), {
          preferredCamera: 'environment',
          maxScansPerSecond: 8,
          highlightScanRegion: false,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
          onDecodeError: () => {}
        });
        await scanner.start();
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : '';
        error =
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access for Groot, then reopen this scanner.'
            : 'No usable camera is available. Connect a camera or enter the payment request manually.';
      }
    })();
    return () => {
      stopped = true;
      scanner?.destroy();
    };
  });
</script>

<div class="scanner">
  <video
    bind:this={video}
    muted
    playsinline
    aria-label={translate($locale, 'Payment QR camera preview')}
  ></video>
  <div class="scan-guide" aria-hidden="true"></div>
  <div class="scan-status" role="status">
    {#if error}<CameraOff size={16} /><span>{error}</span>{:else}<Camera size={16} /><span
        >{translate(
          $locale,
          processing ? 'Reading payment request…' : 'Point the camera at a Bitcoin payment QR'
        )}</span
      >{/if}
  </div>
</div>

<style>
  .scanner {
    position: relative;
    display: grid;
    gap: 0.75rem;
  }
  .scanner video {
    width: 100%;
    min-height: 260px;
    max-height: 55vh;
    object-fit: cover;
    border-radius: 1rem;
    background: #05070a;
  }
  .scan-guide {
    position: absolute;
    inset: 12% 18% 5rem;
    border: 2px solid color-mix(in srgb, var(--link) 75%, white);
    border-radius: 1rem;
    pointer-events: none;
  }
  .scan-status {
    display: flex;
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
