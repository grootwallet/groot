import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ video: process.env.MOBILE_KEY_EVIDENCE_DIR ? 'on' : 'retain-on-failure' });

for (const theme of ['light', 'dark']) {
  test(`${theme} phone review preserves the exact revision and clears rejected credentials`, async ({
    page
  }, info) => {
    await page.addInitScript((value) => {
      localStorage.setItem('groot-theme', value);
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [] }) }
      });
    }, theme);
    await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export default class { constructor(_video, emit) { window.emitPhoneFrame = () => emit({ data: "ur:crypto-psbt/synthetic" }); } async start() {} stop() {} destroy() {} }'
      })
    );
    await page.goto('/mobile/sign');
    await page.evaluate(async () => {
      const modulePath = '/src/lib/wallet/index.ts';
      const { walletService, WalletError } = await import(modulePath);
      walletService.decodePsbtUr = async () => 'synthetic-reviewed-psbt';
      walletService.reviewMobilePsbt = async () => ({
        revisionId: 'synthetic-exact-revision',
        transactionId: 'a'.repeat(64),
        inputCount: 2,
        recipients: [
          { address: 'bcrt1qsyntheticrecipient0000000000000000000000', amountSats: 10000 }
        ],
        change: [{ address: 'bcrt1qsyntheticchange0000000000000000000000000', amountSats: 8900 }],
        feeSats: 1100,
        estimatedVbytes: 220,
        feeRateSatVb: 5,
        lockTime: 101,
        replaceable: true,
        alreadySignedBy: ['1234abcd']
      });
      walletService.signMobilePsbt = async (psbt: string, revision: string, credential: string) => {
        if (psbt !== 'synthetic-reviewed-psbt' || revision !== 'synthetic-exact-revision')
          throw new Error('Reviewed transaction changed');
        if (credential !== 'synthetic-correct-pin')
          throw new WalletError('invalid_credential', 'Incorrect app PIN.');
        return {
          revisionId: revision,
          signerFingerprint: 'abcd1234',
          signedPsbt: 'synthetic-signed',
          frames: ['ur:crypto-psbt/synthetic-signed']
        };
      };
    });
    await page.getByRole('button', { name: 'Allow camera', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => typeof (window as Window & { emitPhoneFrame?: unknown }).emitPhoneFrame)
      )
      .toBe('function');
    await page.evaluate(() => (window as Window & { emitPhoneFrame: () => void }).emitPhoneFrame());
    await expect(page.getByText('Transaction verified', { exact: true })).toBeVisible();
    await expect(page.getByText('5 sat/vB', { exact: true })).toBeVisible();
    await expect(page.getByText('220 vB', { exact: true })).toBeVisible();
    await expect(page.getByText('1234abcd', { exact: true })).toBeVisible();
    const capture = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      if (!process.env.MOBILE_KEY_EVIDENCE_DIR) return;
      const directory = resolve(process.env.MOBILE_KEY_EVIDENCE_DIR, info.project.name);
      mkdirSync(directory, { recursive: true });
      await page.screenshot({ path: resolve(directory, `${theme}-${name}.png`), fullPage: true });
    };
    await capture('sign-review');
    const pin = page.getByLabel('Local app PIN', { exact: true });
    await pin.fill('synthetic-wrong-pin');
    await page.getByRole('button', { name: 'Sign this exact PSBT', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(pin).toHaveValue('');
    await pin.fill('synthetic-correct-pin');
    await page.getByRole('button', { name: 'Sign this exact PSBT', exact: true }).click();
    await expect(page.getByText('Signature ready', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /Signed crypto-psbt QR/ })).toBeVisible();
    await capture('signature-ready');
    await page.getByRole('button', { name: 'Sign another PSBT', exact: true }).click();
    await expect(page.getByText('Scan unsigned PSBT from desktop', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Local app PIN', { exact: true })).toHaveCount(0);
  });
}
