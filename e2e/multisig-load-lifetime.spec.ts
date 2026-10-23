import { test, expect } from '@playwright/test';

test('multisig load does not start an acceleration quote after navigation', async ({ page }) => {
  await page.goto('/multisig');
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
    const link = document.createElement('a');
    link.href = '/multisig/send?accelerate=rbf&txid=synthetic';
    document.body.append(link);
    link.click();
    link.remove();
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishFees)).toBe('function');
  await page.goBack();
  await expect(page).not.toHaveURL(/multisig\/send/);
  await page.evaluate(async () => {
    (window as any).finishFees();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(await page.evaluate(() => (window as any).obsoleteQuoteCalls)).toBe(0);
});
