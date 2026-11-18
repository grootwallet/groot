import type QrScanner from 'qr-scanner';

/** One scanner's camera lifetime; decoded data still goes through native validation. */
export function createQrCamera(video: HTMLVideoElement, onscan: (value: string) => void) {
  let scanner: QrScanner | undefined;
  let revision = 0;
  let disposed = false;

  function stop() {
    revision++;
    scanner?.destroy();
    scanner = undefined;
  }

  async function start() {
    stop();
    if (disposed) return false;
    const attempt = revision;
    const current = () => !disposed && attempt === revision;
    try {
      if (!window.isSecureContext) throw new Error('insecure_camera_origin');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
      // Run from the Allow camera click, before loading the decoder. The decoder
      // otherwise collapses platform denial/busy errors into "Camera not found".
      const permission = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      for (const track of permission.getTracks()) track.stop();
      if (!current()) return false;
      const { default: QrScanner } = await import('qr-scanner');
      if (!current()) return false;
      const candidate = new QrScanner(
        video,
        (result) => {
          if (current()) onscan(result.data);
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
      scanner = candidate;
      await candidate.start();
      if (!current()) {
        candidate.destroy();
        return false;
      }
      return true;
    } catch (cause) {
      if (!current()) return false;
      stop();
      throw cause;
    }
  }

  function destroy() {
    disposed = true;
    stop();
  }

  return { start, stop, destroy };
}

export function cameraError(cause: unknown, unavailable: string) {
  const name = cause instanceof DOMException ? cause.name : '';
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message === 'insecure_camera_origin')
    return 'Camera access requires Groot’s secure app connection. Reopen the scanner in Groot.';
  if (name === 'NotAllowedError')
    return 'Camera access was denied. Allow camera access for Groot, then try again.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'The camera is being used by another app. Close its camera, then try again.';
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    message === 'camera_unavailable' ||
    message === 'Camera not found.'
  )
    return unavailable;
  return 'Groot could not start the camera. Check its system permission, then try again.';
}
