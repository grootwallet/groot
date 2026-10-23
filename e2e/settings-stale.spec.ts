import { test, expect } from '@playwright/test';

for (const success of [true, false]) {
  test(`node save ${success ? 'success' : 'failure'} does not publish after navigation`, async ({
    page
  }) => {
    await page.goto('/');
    await page.locator('a[href="/settings"]:visible').first().click();
    await page.getByRole('button', { name: /Bitcoin Core connection/ }).click();
    await page.evaluate(async () => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService } = await import(path);
      walletService.saveNodeConfig = () =>
        new Promise((resolve, reject) => {
          Object.assign(window, {
            finishNode: (success: boolean) =>
              success
                ? resolve({ connected: true, blocks: 123, pruned: false, pruneHeight: null })
                : reject(new Error('synthetic old-node failure'))
          });
        });
    });
    const dialog = page.getByRole('dialog', { name: 'Connect Bitcoin Core' });
    await dialog.getByRole('button', { name: 'Custom remote' }).click();
    await dialog.getByLabel('RPC URL').fill('https://node.example.test:18443');
    await dialog.getByLabel('RPC username').fill('synthetic-user');
    await dialog.getByLabel('RPC password', { exact: true }).fill('synthetic-rpc');
    await dialog.getByLabel('Wallet passphrase', { exact: true }).fill('synthetic-credential');
    await dialog.getByRole('button', { name: 'Save & test' }).click();
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).finishNode))
      .toBe('function');
    await page.goBack();
    await expect(dialog).not.toBeVisible();
    await page.evaluate((success) => (window as any).finishNode(success), success);
    await expect(page).not.toHaveURL(/\/settings$/);
    await expect(page.getByText('Node saved and verified', { exact: true })).toHaveCount(0);
    await expect(page.getByText('synthetic old-node failure', { exact: true })).toHaveCount(0);
  });
}
