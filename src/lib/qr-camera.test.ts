import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cameraError, createQrCamera } from './qr-camera';

const fake = vi.hoisted(() => ({
  start: vi.fn(),
  destroy: vi.fn(),
  emit: undefined as undefined | ((value: { data: string }) => void)
}));
vi.mock('qr-scanner', () => ({
  default: class {
    constructor(_video: unknown, emit: typeof fake.emit) {
      fake.emit = emit;
    }
    start = fake.start;
    destroy = fake.destroy;
  }
}));

const video = {} as HTMLVideoElement;
beforeEach(() => {
  vi.clearAllMocks();
  fake.start.mockResolvedValue(undefined);
  fake.emit = undefined;
  vi.stubGlobal('window', { isSecureContext: true });
});
afterEach(() => vi.unstubAllGlobals());

function media(getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] })) {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return getUserMedia;
}

describe('camera lifetime', () => {
  it('releases the permission probe, requests no audio and suppresses late frames', async () => {
    const stop = vi.fn();
    const request = media(vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }));
    const emit = vi.fn();
    const camera = createQrCamera(video, emit);
    expect(await camera.start()).toBe(true);
    expect(request).toHaveBeenCalledWith({ audio: false, video: true });
    expect(stop).toHaveBeenCalledOnce();
    fake.emit?.({ data: 'SYNTHETIC-case-exact' });
    camera.stop();
    fake.emit?.({ data: 'obsolete' });
    expect(emit).toHaveBeenCalledExactlyOnceWith('SYNTHETIC-case-exact');
    expect(fake.destroy).toHaveBeenCalledOnce();
  });

  it('releases permission granted after teardown without opening the decoder', async () => {
    let grant!: (stream: unknown) => void;
    media(
      vi.fn(
        () =>
          new Promise((resolve) => {
            grant = resolve;
          })
      )
    );
    const stop = vi.fn();
    const camera = createQrCamera(video, vi.fn());
    const pending = camera.start();
    camera.destroy();
    grant({ getTracks: () => [{ stop }] });
    expect(await pending).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
    expect(fake.start).not.toHaveBeenCalled();
    expect(await camera.start()).toBe(false);
  });

  it('destroys a decoder that finishes starting after cancellation', async () => {
    media();
    let complete!: () => void;
    fake.start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        })
    );
    const camera = createQrCamera(video, vi.fn());
    const pending = camera.start();
    await vi.waitFor(() => expect(fake.start).toHaveBeenCalledOnce());
    camera.destroy();
    complete();
    expect(await pending).toBe(false);
    expect(fake.destroy).toHaveBeenCalled();
  });

  it('retains the platform denial and supports a fresh retry', async () => {
    const denied = new DOMException('synthetic', 'NotAllowedError');
    const request = media(
      vi
        .fn()
        .mockRejectedValueOnce(denied)
        .mockResolvedValue({ getTracks: () => [] })
    );
    const camera = createQrCamera(video, vi.fn());
    await expect(camera.start()).rejects.toBe(denied);
    expect(fake.start).not.toHaveBeenCalled();
    expect(await camera.start()).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    camera.destroy();
  });

  it('cleans up a failed decoder before retry', async () => {
    media();
    fake.start.mockRejectedValueOnce(new Error('synthetic decoder failure'));
    const camera = createQrCamera(video, vi.fn());
    await expect(camera.start()).rejects.toThrow('synthetic decoder failure');
    expect(fake.destroy).toHaveBeenCalledOnce();
    expect(await camera.start()).toBe(true);
    camera.destroy();
  });

  it('rejects insecure and unavailable capture before requesting a camera', async () => {
    const request = media();
    vi.stubGlobal('window', { isSecureContext: false });
    await expect(createQrCamera(video, vi.fn()).start()).rejects.toThrow('insecure_camera_origin');
    expect(request).not.toHaveBeenCalled();
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', {});
    await expect(createQrCamera(video, vi.fn()).start()).rejects.toThrow('camera_unavailable');
  });
});

it.each([
  ['NotAllowedError', 'denied'],
  ['NotReadableError', 'another app'],
  ['AbortError', 'another app'],
  ['NotFoundError', 'synthetic fallback'],
  ['DevicesNotFoundError', 'synthetic fallback'],
  ['UnknownError', 'Check its system permission']
])('classifies %s without showing raw platform details', (name, expected) => {
  expect(
    cameraError(new DOMException('PRIVATE PLATFORM DETAIL', name), 'synthetic fallback')
  ).toContain(expected);
  expect(
    cameraError(new DOMException('PRIVATE PLATFORM DETAIL', name), 'synthetic fallback')
  ).not.toContain('PRIVATE');
});
