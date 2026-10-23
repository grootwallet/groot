import { test, expect, type Page } from '@playwright/test';

type Phase = 'decode' | 'review' | 'sign';
async function preparePhone(page: Page, phase: Phase) {
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
  await page.evaluate(async (phase) => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    const review = {
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
    };
    const signed = {
      revisionId: 'synthetic-revision',
      signerFingerprint: '1234abcd',
      signedPsbt: 'synthetic-signed',
      frames: ['ur:crypto-psbt/synthetic']
    };
    const deferred = (value: unknown) =>
      new Promise((resolve, reject) => {
        Object.assign(window, {
          finishPhone: (ok: boolean) =>
            ok ? resolve(value) : reject(new Error('synthetic obsolete phone failure'))
        });
      });
    Object.assign(window, { reviewCalls: 0, signingCalls: 0 });
    walletService.decodePsbtUr = async () =>
      phase === 'decode' ? deferred('synthetic-reviewed') : 'synthetic-reviewed';
    walletService.reviewMobilePsbt = async () => {
      (window as any).reviewCalls++;
      return phase === 'review' ? deferred(review) : review;
    };
    walletService.signMobilePsbt = async () => {
      (window as any).signingCalls++;
      return deferred(signed);
    };
  }, phase);
  await page.getByRole('button', { name: 'Allow camera', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).emitPhoneFrame))
    .toBe('function');
  await page.evaluate(() => (window as any).emitPhoneFrame());
  if (phase === 'sign') {
    await expect(page.getByText('Transaction verified', { exact: true })).toBeVisible();
    await page.getByLabel('Local app PIN', { exact: true }).fill('synthetic-pin');
    await page.getByRole('button', { name: 'Sign this exact PSBT', exact: true }).click();
    await expect(page.getByLabel('Local app PIN', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Working…', exact: true }).dispatchEvent('click');
    expect(await page.evaluate(() => (window as any).signingCalls)).toBe(1);
  }
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishPhone)).toBe('function');
}

for (const phase of ['decode', 'review', 'sign'] as const) {
  for (const departure of ['reset', 'navigation'] as const) {
    for (const success of [true, false]) {
      test(`phone ${phase} ${success ? 'success' : 'failure'} is ignored after ${departure}`, async ({
        page
      }) => {
        await preparePhone(page, phase);
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
        await page.evaluate((ok) => (window as any).finishPhone(ok), success);
        if (departure === 'reset')
          await expect(
            page.getByText('Scan unsigned PSBT from desktop', { exact: true })
          ).toBeVisible();
        if (phase === 'decode')
          expect(await page.evaluate(() => (window as any).reviewCalls)).toBe(0);
        await expect(page.getByText('Signature ready', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Transaction verified', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(page.getByText('PSBT signed on this phone', { exact: true })).toHaveCount(0);
      });
    }
  }
}
