import { test, expect } from '@playwright/test';

for (const departure of ['reset', 'navigation'] as const) {
  for (const outcome of ['success', 'failure'] as const) {
    test(`phone ${departure} ignores a delayed signing ${outcome}`, async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: async () => ({ getTracks: () => [] }) }
        });
      });
      await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export default class { constructor(_video, emit) { window.emitPhoneFrame = () => emit({ data: "ur:crypto-psbt/synthetic" }); } async start() {} stop() {} destroy() {} }'
        })
      );
      await page.goto('/mobile/sign');
      await page.evaluate(async () => {
        const path = '/src/lib/wallet/index.ts';
        const { walletService } = await import(path);
        walletService.decodePsbtUr = async () => 'synthetic-reviewed';
        walletService.reviewMobilePsbt = async () => ({
          revisionId: 'synthetic-revision',
          transactionId: 'a'.repeat(64),
          inputCount: 1,
          recipients: [{ address: 'bcrt1qsynthetic', amountSats: 1000 }],
          change: [],
          feeSats: 100,
          estimatedVbytes: 100,
          feeRateSatVb: 1,
          lockTime: 0,
          replaceable: true,
          alreadySignedBy: []
        });
        Object.assign(window, { signingCalls: 0 });
        walletService.signMobilePsbt = () =>
          new Promise((resolve, reject) => {
            (window as any).signingCalls++;
            Object.assign(window, {
              finishSigning: (success: boolean) =>
                success
                  ? resolve({
                      revisionId: 'synthetic-revision',
                      signerFingerprint: '1234abcd',
                      signedPsbt: 'synthetic-signed',
                      frames: ['ur:crypto-psbt/synthetic']
                    })
                  : reject(new Error('synthetic delayed failure'))
            });
          });
      });
      await page.getByRole('button', { name: 'Allow camera', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => typeof (window as any).emitPhoneFrame))
        .toBe('function');
      await page.evaluate(() => (window as any).emitPhoneFrame());
      await expect(page.getByText('Transaction verified', { exact: true })).toBeVisible();
      await page.getByLabel('Local app PIN', { exact: true }).fill('synthetic-pin');
      await page.getByRole('button', { name: 'Sign this exact PSBT', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => typeof (window as any).finishSigning))
        .toBe('function');
      await expect(page.getByLabel('Local app PIN', { exact: true })).toHaveValue('');
      await page
        .getByRole('button', { name: /Sign this exact PSBT|Signing/ })
        .dispatchEvent('click');
      expect(await page.evaluate(() => (window as any).signingCalls)).toBe(1);
      if (departure === 'reset') {
        await page.getByRole('button', { name: 'Scan again', exact: true }).click();
      } else {
        await page.evaluate(() => {
          const link = document.createElement('a');
          link.href = '/settings';
          link.textContent = 'Leave signing test';
          document.body.append(link);
        });
        await page.getByRole('link', { name: 'Leave signing test' }).click();
        await expect(page).toHaveURL(/\/settings$/);
      }
      await page.evaluate(
        (success) => (window as any).finishSigning(success),
        outcome === 'success'
      );
      if (departure === 'reset')
        await expect(
          page.getByText('Scan unsigned PSBT from desktop', { exact: true })
        ).toBeVisible();
      await expect(page.getByText('Signature ready', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText('PSBT signed on this phone', { exact: true })).toHaveCount(0);
    });
  }
}
