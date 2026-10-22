<script lang="ts">
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { Camera, CameraOff, Check } from '@lucide/svelte';
  import { onDestroy } from 'svelte';
  import Button from './Button.svelte';
  import type QrScanner from 'qr-scanner';

  let {
    onframe,
    acceptedTypes = ['crypto-psbt'],
    prompt = 'Point the camera at a crypto-psbt QR',
    onreset
  } = $props<{
    onframe: (frame: string) => boolean | void | Promise<boolean | void>;
    acceptedTypes?: string[];
    prompt?: string;
    onreset?: () => void;
  }>();
  let video = $state<HTMLVideoElement>();
  let error = $state('');
  let scanned = $state(0);
  let starting = $state(false);
  let cameraActive = $state(false);
  let expectedParts = $state(0);
  let scanComplete = $state(false);
  let processingFrames = false;
  let scanner: QrScanner | undefined;
  let stopped = false;
  const seen = new Set<string>();
  const pendingFrames: string[] = [];
  const estimatedFrameTarget = $derived(expectedParts > 0 ? expectedParts * 2 : 0);
  const progress = $derived(
    scanComplete
      ? 100
      : estimatedFrameTarget > 0
        ? Math.min(99, Math.round((scanned / estimatedFrameTarget) * 100))
        : 0
  );
  const progressLabel = $derived(
    expectedParts > 0
      ? translate($locale, '{scanned} frames scanned · about {progress}%', {
          scanned,
          progress
        })
      : ''
  );

  async function processPendingFrames() {
    if (processingFrames || stopped) return;
    processingFrames = true;
    try {
      while (pendingFrames.length && !stopped && !scanComplete) {
        const next = pendingFrames.shift();
        if (!next) continue;
        scanComplete = (await onframe(next)) === true;
      }
      if (scanComplete) {
        scanner?.destroy();
        scanner = undefined;
        cameraActive = false;
        pendingFrames.length = 0;
      }
    } catch (cause) {
      error = localizedError(cause, $locale, 'This QR could not be verified.');
      pendingFrames.length = 0;
      scanner?.stop();
      cameraActive = false;
    } finally {
      processingFrames = false;
    }
  }

  async function acceptFrame(rawValue: string) {
    if (error || scanComplete || stopped) return;
    if (rawValue.length > 4096) {
      error = 'Too many QR frames. Restart the scan.';
      pendingFrames.length = 0;
      scanner?.stop();
      cameraActive = false;
      return;
    }
    const frame = rawValue.trim().toLowerCase();
    if (
      !acceptedTypes.some((type: string) => frame.startsWith(`ur:${type.toLowerCase()}/`)) ||
      seen.has(frame) ||
      stopped
    )
      return;
    const frameLimit = acceptedTypes.every((type: string) => type === 'crypto-psbt') ? 1024 : 512;
    if (seen.size >= frameLimit) {
      error = 'Too many QR frames. Restart the scan.';
      pendingFrames.length = 0;
      scanner?.stop();
      cameraActive = false;
      return;
    }
    seen.add(frame);
    scanned = seen.size;
    const multipart = frame.match(/^ur:[^/]+\/\d+-(\d+)\//);
    if (multipart) expectedParts = Math.max(expectedParts, Number(multipart[1]) || 0);
    pendingFrames.push(frame);
    await processPendingFrames();
  }

  async function startCamera() {
    if (starting || stopped) return;
    starting = true;
    error = '';
    seen.clear();
    pendingFrames.length = 0;
    scanned = 0;
    expectedParts = 0;
    scanComplete = false;
    onreset?.();
    scanner?.destroy();
    scanner = undefined;
    cameraActive = false;
    try {
      if (!window.isSecureContext) throw new Error('insecure_camera_origin');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');

      // Request platform permission directly from this user gesture. QrScanner
      // intentionally collapses all getUserMedia failures into "Camera not
      // found", which would hide denial and camera-in-use states from Groot.
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
      });
      for (const track of permissionStream.getTracks()) track.stop();
      if (stopped) return;
      const { default: QrScanner } = await import('qr-scanner');
      if (stopped) return;

      if (!video) throw new Error('camera_unavailable');
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
      if (stopped || scanComplete) {
        scanner?.destroy();
        return;
      }
      cameraActive = true;
    } catch (cause) {
      if (stopped) return;
      const name = cause instanceof DOMException ? cause.name : '';
      const message = cause instanceof Error ? cause.message : '';
      error =
        message === 'insecure_camera_origin'
          ? 'Camera access requires Groot’s secure app connection. Reopen this scanner in the desktop app.'
          : name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access for Groot, then reopen this scanner.'
            : name === 'NotReadableError' || name === 'AbortError'
              ? 'The camera is being used by another app. Close its camera, then try again.'
              : name === 'NotFoundError' || name === 'DevicesNotFoundError'
                ? 'No usable camera is available. Connect a camera or import the signed PSBT file instead.'
                : 'Groot could not start the camera. Check its system permission, then try again.';
    } finally {
      starting = false;
    }
  }

  onDestroy(() => {
    stopped = true;
    scanner?.destroy();
  });
</script>

<div class="scanner" class:camera-active={cameraActive}>
  {#if !scanComplete}<div class="camera-frame" class:camera-inactive={!cameraActive}>
      <video
        bind:this={video}
        muted
        playsinline
        aria-label={translate($locale, 'Animated QR camera preview')}
      ></video>
      <div class="scan-guide" aria-hidden="true"></div>
    </div>
  {/if}
  {#if error && !scanComplete}<WarningNotice
      tone="danger"
      icon
      role="alert"
      body={translate($locale, error)}
    />{:else}
    <div class="scan-status" role="status">
      {#if scanComplete}<Check size={16} /><span>{translate($locale, 'QR verified')}</span>
      {:else}
        {#if cameraActive}<Camera size={16} /><span
            >{translate(
              $locale,
              starting
                ? 'Requesting camera permission…'
                : scanned
                  ? scanned === 1
                    ? '{count} unique frame scanned'
                    : '{count} unique frames scanned'
                  : prompt,
              { count: scanned }
            )}</span
          >{:else}<CameraOff size={16} /><span
            >{translate($locale, 'Allow camera access to scan this QR.')}</span
          >{/if}
      {/if}
    </div>
  {/if}
  {#if cameraActive && expectedParts > 0}
    <div class="scan-progress" aria-live="polite">
      <progress max="100" value={progress} aria-label={translate($locale, 'QR scan progress')}
        >{progress}%</progress
      >
      <span>{progressLabel}</span>
    </div>
  {/if}
  {#if !cameraActive && !scanComplete}
    <Button class="scanner-retry full" loading={starting} onclick={startCamera}
      >{translate($locale, error ? 'Try camera again' : 'Allow camera')}</Button
    >
  {/if}
</div>

<style>
  .scanner {
    display: grid;
    gap: 0.75rem;
    width: 100%;
    margin-inline: auto;
  }
  .scanner.camera-active {
    width: min(100%, 68dvh, 38rem);
  }
  .camera-frame.camera-inactive {
    position: fixed;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .camera-frame {
    position: relative;
    aspect-ratio: 1;
  }
  .scanner video {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 1rem;
    background: #05070a;
  }
  .scan-guide {
    position: absolute;
    inset: 12%;
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
  .scan-progress {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .scan-progress progress {
    width: 100%;
    height: 0.45rem;
    accent-color: var(--link);
  }
</style>
