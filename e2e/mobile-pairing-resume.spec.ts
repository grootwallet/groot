import { expect, test } from '@playwright/test';

test.describe('resuming an encrypted phone pairing', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.addInitScript(() => {
      sessionStorage.setItem('fixture-pending-mobile-pairing', '1');
    });
  });

  for (const entry of [
    '/welcome?fixture-empty=1&fixture-native-mobile=1',
    '/unlock?fixture-native-mobile=1&fixture-locked-wallet-switch=1'
  ]) {
    test(`can resume directly from ${entry.split('?')[0]} after restart`, async ({ page }) => {
      await page.goto(entry);
      await page.getByRole('link', { name: 'Resume pairing', exact: true }).click();
      await expect(page.getByText('Phone key saved', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Local app PIN', { exact: true })).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Allow camera' })).toHaveCount(0);
    });
  }

  test('background lock returns to the saved key and the correct final QR step', async ({
    page
  }) => {
    await page.goto('/mobile/pair?fixture-native-mobile=1');
    await expect(page.getByText('Phone key saved', { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService, WalletError } = await import(path);
      const lockAll = walletService.lockAll.bind(walletService);
      walletService.lockAll = async () => {
        const calls = Number(document.body.dataset.fixtureMobileLockCalls ?? 0);
        document.body.dataset.fixtureMobileLockCalls = String(calls + 1);
        await lockAll();
      };
      walletService.resumePairingOnMobile = async (sessionId: string, pin: string) => {
        if (pin !== 'synthetic-pin') throw new WalletError('invalid_credential', 'Incorrect PIN.');
        return {
          sessionId,
          fingerprint: 'abcd1234',
          xpubChecksum: 'synthetic',
          backupVerified: true,
          comparisonCode: '123456',
          frames: [],
          awaitingFinalPolicy: true
        };
      };
    });

    const pin = page.getByLabel('Local app PIN', { exact: true });
    await pin.fill('partially-entered');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('body')).toHaveAttribute('data-fixture-mobile-lock-calls', '1');
    await expect(page).toHaveURL(/\/mobile\/pair/);
    await expect(page.getByText('Phone key saved', { exact: true })).toBeVisible();
    await expect(pin).toHaveValue('');
    expect(
      await page.evaluate(async () => {
        const path = '/src/lib/wallet/index.ts';
        const { walletService } = await import(path);
        return (await walletService.session()).unlocked;
      })
    ).toBe(false);

    await pin.fill('wrong-pin');
    await page.getByRole('button', { name: 'Resume pairing' }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect PIN.');
    await expect(pin).toHaveValue('');
    await pin.fill('synthetic-pin');
    await page.getByRole('button', { name: 'Resume pairing' }).click();
    await expect(page.getByText('Scan the final wallet policy', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allow camera' })).toBeVisible();
    await expect(pin).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath('resumed-final-policy.png'),
      animations: 'disabled'
    });
  });
});
