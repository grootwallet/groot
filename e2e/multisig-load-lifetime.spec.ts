import { test, expect } from '@playwright/test';

test('multisig load does not start an acceleration quote after navigation', async ({ page }) => {
  await page.goto('/multisig?fixture-selected-multisig=1');
  await expect(page.getByRole('heading', { name: 'Family wallet', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    Object.assign(window, { obsoleteQuoteCalls: 0 });
    walletService.estimateFees = () =>
      new Promise((resolve) => {
        Object.assign(window, {
          finishFees: () => resolve({ economy: 1, standard: 2, priority: 3 })
        });
      });
    walletService.quoteRbf = async () => {
      (window as any).obsoleteQuoteCalls++;
      throw new Error('An obsolete load requested a quote');
    };
    const link = document.querySelector<HTMLAnchorElement>('a[href="/multisig/send"]')!;
    link.href = '/multisig/send?accelerate=rbf&txid=synthetic';
  });
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishFees)).toBe('function');
  await page.goBack();
  await expect(page).not.toHaveURL(/multisig\/send/);
  await page.evaluate(async () => {
    (window as any).finishFees();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(await page.evaluate(() => (window as any).obsoleteQuoteCalls)).toBe(0);
});

for (const success of [true, false]) {
  test(`multisig retry ignores an older wallet read ${success ? 'success' : 'failure'}`, async ({
    page
  }) => {
    await page.goto('/multisig?fixture-selected-multisig=1');
    await expect(page.getByRole('heading', { name: 'Family wallet', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService } = await import(path);
      const wallet = await walletService.multisigWallet();
      const snapshot = walletService.multisigSnapshot.bind(walletService);
      let walletReads = 0;
      let snapshotReads = 0;
      walletService.multisigWallet = () =>
        ++walletReads === 1
          ? new Promise((resolve, reject) => {
              Object.assign(window, {
                finishOldWallet: (ok: boolean) =>
                  ok
                    ? resolve({ ...wallet, threshold: 3 })
                    : reject(new Error('obsolete wallet read failure'))
              });
            })
          : Promise.resolve(wallet);
      walletService.multisigSnapshot = () =>
        ++snapshotReads === 1
          ? Promise.reject(new Error('synthetic initial snapshot failure'))
          : snapshot();
    });
    await page.getByRole('link', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Wallet details are unavailable', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    const signers = page.getByRole('region', { name: 'Payment signers' });
    await expect(signers).toContainText('2 of 3');
    await page.evaluate((ok) => (window as any).finishOldWallet(ok), success);
    await expect(signers).toContainText('2 of 3');
    await expect(signers).not.toContainText('3 of 3');
    await expect(page.getByText('obsolete wallet read failure', { exact: true })).toHaveCount(0);
  });
}
