<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Camera, CameraOff } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import QrScanner from 'qr-scanner';

  let {
    onframe,
    acceptedTypes = ['crypto-psbt'],
    prompt = 'Point the camera at a crypto-psbt QR'
  } = $props<{
    onframe: (frame: string) => void | Promise<void>;
    acceptedTypes?: string[];
    prompt?: string;
  }>();
  let video: HTMLVideoElement;
  let error = $state('');
  let scanned = $state(0);

  onMount(() => {
    let scanner: QrScanner | undefined;
    let stopped = false;
    const seen = new Set<string>();

    async function acceptFrame(rawValue: string) {
      const frame = rawValue.trim().toLowerCase();
      if (
        !acceptedTypes.some((type: string) => frame.startsWith(`ur:${type.toLowerCase()}/`)) ||
        seen.has(frame) ||
        stopped
      )
        return;
      if (seen.size >= 1024) {
        error = 'Too many QR frames. Restart the scan.';
        scanner?.stop();
        return;
      }
      seen.add(frame);
      scanned = seen.size;
      await onframe(frame);
    }

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
        scanner = new QrScanner(
          video,
          (result) => {
            void acceptFrame(result.data);
          },
          {
            preferredCamera: 'environment',
            maxScansPerSecond: 8,
            highlightScanRegion: false,
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
            onDecodeError: () => {}
          }
        );
        await scanner.start();
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : '';
        error =
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access for Groot, then reopen this scanner.'
            : 'No usable camera is available. Connect a camera or import the signed PSBT file instead.';
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
    aria-label={translate($locale, 'Animated QR camera preview')}
  ></video>
  <div class="scan-guide" aria-hidden="true"></div>
  <div class="scan-status">
    {#if error}<CameraOff size={16} /><span>{error}</span>{:else}<Camera size={16} /><span
        >{translate($locale, scanned ? `${scanned} unique frames scanned` : prompt)}</span
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
