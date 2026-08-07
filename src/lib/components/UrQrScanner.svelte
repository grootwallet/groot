<script lang="ts">
  import { Camera, CameraOff } from '@lucide/svelte';
  import { onMount } from 'svelte';

  type DetectedBarcode = { rawValue: string };
  type Detector = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
  type DetectorConstructor = new (options: { formats: string[] }) => Detector;

  let { onframe } = $props<{ onframe: (frame: string) => void | Promise<void> }>();
  let video: HTMLVideoElement;
  let error = $state('');
  let scanned = $state(0);

  onMount(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    const seen = new Set<string>();
    void (async () => {
      const DetectorClass = (globalThis as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!DetectorClass) { error = 'QR scanning is not available in this WebView. Import the PSBT file instead.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        video.srcObject = stream;
        await video.play();
        const detector = new DetectorClass({ formats: ['qr_code'] });
        timer = setInterval(() => {
          if (stopped || video.readyState < 2) return;
          void detector.detect(video).then(async (codes) => {
            for (const code of codes) {
              const frame = code.rawValue.trim().toLowerCase();
              if (!frame.startsWith('ur:crypto-psbt/') || seen.has(frame)) continue;
              if (seen.size >= 1024) { error = 'Too many QR frames. Restart the scan.'; return; }
              seen.add(frame); scanned = seen.size; await onframe(frame);
            }
          }).catch(() => { error = 'The camera could not read that QR frame. Keep the code centered and well lit.'; });
        }, 180);
      } catch { error = 'Camera access was denied or is unavailable. Allow camera access, then reopen this scanner.'; }
    })();
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()); };
  });
</script>

<div class="scanner">
  <video bind:this={video} muted playsinline aria-label="Animated QR camera preview"></video>
  <div class="scan-guide" aria-hidden="true"></div>
  <div class="scan-status">{#if error}<CameraOff size={16}/><span>{error}</span>{:else}<Camera size={16}/><span>{scanned ? `${scanned} unique frames scanned` : 'Point the camera at a crypto-psbt QR'}</span>{/if}</div>
</div>

<style>
  .scanner{position:relative;display:grid;gap:.75rem}.scanner video{width:100%;min-height:260px;max-height:55vh;object-fit:cover;border-radius:1rem;background:#05070a}.scan-guide{position:absolute;inset:12% 18% 5rem;border:2px solid color-mix(in srgb,var(--primary) 75%,white);border-radius:1rem;pointer-events:none}.scan-status{display:flex;align-items:flex-start;gap:.5rem;color:var(--muted-foreground);font-size:.875rem}.scan-status :global(svg){flex:none;margin-top:.1rem}
</style>
