import { expect, test } from '@playwright/test';

test('payment camera retries denial and busy errors, then forwards exact QR text', async ({
  page
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          calls++;
          if (calls <= 2)
            throw new DOMException(
              'synthetic',
              calls === 1 ? 'NotAllowedError' : 'NotReadableError'
            );
          return { getTracks: () => [] };
        }
      }
    });
  });
  await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export default class { constructor(_video, emit) { window.emitPaymentQr = value => emit({ data: value }); } async start() {} destroy() {} }`
    })
  );
  await page.goto('/send');
  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    const original = walletService.inspectPaymentRequest.bind(walletService);
    walletService.inspectPaymentRequest = async (value: string) => {
      (window as unknown as { scanned: string }).scanned = value;
      return original(value);
    };
  });
  await page.getByRole('button', { name: 'Scan Bitcoin payment QR' }).click();
  const dialog = page.getByRole('dialog', { name: 'Scan payment request' });
  await dialog.getByRole('button', { name: 'Allow camera', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Camera access was denied');
  const retry = dialog.getByRole('button', { name: 'Try camera again', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await retry.focus();
    await expect(retry).toBeFocused();
    const bounds = await retry.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', page.viewportSize()!.width);
    await page.screenshot({ path: test.info().outputPath(`camera-denial-${theme}.png`) });
  }
  await retry.click();
  await expect(dialog.getByRole('alert')).toContainText('being used by another app');
  await retry.click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(
    dialog.getByText('Point the camera at a Bitcoin payment QR', { exact: true })
  ).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { emitPaymentQr: (value: string) => void }).emitPaymentQr(
      'not-a-Bitcoin-request-CASE'
    )
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { scanned: string }).scanned))
    .toBe('not-a-Bitcoin-request-CASE');
  await expect(dialog.getByRole('alert')).toContainText('QR code rejected');
});

test('closing payment scanning during permission releases the eventual stream', async ({
  page
}) => {
  let decoderRequested = false;
  await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) => {
    decoderRequested = true;
    return route.abort();
  });
  await page.addInitScript(() => {
    const flags = window as unknown as { grant?: () => void; released?: boolean };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise((resolve) => {
            flags.grant = () =>
              resolve({
                getTracks: () => [
                  {
                    stop: () => {
                      flags.released = true;
                    }
                  }
                ]
              });
          })
      }
    });
  });
  await page.goto('/send');
  await page.getByRole('button', { name: 'Scan Bitcoin payment QR' }).click();
  const dialog = page.getByRole('dialog', { name: 'Scan payment request' });
  await dialog.getByRole('button', { name: 'Allow camera', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { grant?: unknown }).grant))
    .toBe('function');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.evaluate(() => (window as unknown as { grant: () => void }).grant());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { released?: boolean }).released))
    .toBe(true);
  expect(decoderRequested).toBe(false);
});

test('bundled decoder reads synthetic camera pixels and reaches payment inspection', async ({
  page
}) => {
  const { default: QRCode } = await import('qrcode');
  const payload = 'SYNTHETIC-QR-CAMERA-Case-Exact';
  const image = await QRCode.toDataURL(payload, { width: 720, margin: 4 });
  await page.addInitScript(async (url) => {
    const qr = new Image();
    const loaded = new Promise<void>((resolve) => {
      qr.onload = () => resolve();
    });
    qr.src = url;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 720;
    const context = canvas.getContext('2d')!;
    // Keep the complete QR inside the scanner's central two-thirds guide.
    const draw = () => {
      context.fillStyle = 'white';
      context.fillRect(0, 0, 720, 720);
      context.drawImage(qr, 144, 144, 432, 432);
    };
    draw();
    setInterval(draw, 50);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => canvas.captureStream(15),
        enumerateDevices: async () => [
          {
            kind: 'videoinput',
            deviceId: 'synthetic-camera',
            label: 'Synthetic camera',
            groupId: 'synthetic'
          }
        ]
      }
    });
    (window as unknown as { syntheticCameraReady: boolean }).syntheticCameraReady = true;
  }, image);
  await page.goto('/send');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { syntheticCameraReady?: boolean }).syntheticCameraReady
      )
    )
    .toBe(true);
  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    const original = walletService.inspectPaymentRequest.bind(walletService);
    walletService.inspectPaymentRequest = async (value: string) => {
      (window as unknown as { pixelScan: string }).pixelScan = value;
      return original(value);
    };
  });
  await page.getByRole('button', { name: 'Scan Bitcoin payment QR' }).click();
  await page.getByRole('button', { name: 'Allow camera', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { pixelScan?: string }).pixelScan), {
      timeout: 15000
    })
    .toBe(payload);
  await expect(
    page.getByRole('dialog', { name: 'Scan payment request' }).getByRole('alert')
  ).toContainText('QR code rejected');
});
