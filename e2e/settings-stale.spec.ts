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

for (const success of [true, false]) {
  test(`dismissed recovery reveal ${success ? 'success' : 'failure'} allows another attempt`, async ({
    page
  }) => {
    await page.goto('/?fixture-unverified-backup');
    await page.evaluate(async () => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService } = await import(path);
      walletService.revealAndVerifyBackup = () =>
        new Promise((resolve, reject) => {
          Object.assign(window, {
            finishReveal: (ok: boolean) =>
              ok ? resolve(false) : reject(new Error('obsolete reveal failure'))
          });
        });
    });
    await page.locator('a[href="/settings"]:visible').first().click();
    const open = page.getByRole('button', { name: /Recovery words not verified/ });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Verify recovery backup' });
    await dialog.getByLabel('Wallet passphrase', { exact: true }).fill('synthetic-credential');
    await dialog.getByRole('button', { name: 'View recovery words first' }).click();
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).finishReveal))
      .toBe('function');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await open.click();
    await dialog.getByLabel('Wallet passphrase', { exact: true }).fill('synthetic-new-credential');
    await expect(dialog.getByRole('button', { name: 'View recovery words first' })).toBeEnabled();
    await page.evaluate((ok) => (window as any).finishReveal(ok), success);
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    await expect(dialog.getByLabel('Wallet passphrase', { exact: true })).toHaveValue(
      'synthetic-new-credential'
    );
    await expect(page.getByText('obsolete reveal failure', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Backup still unverified', { exact: true })).toHaveCount(0);
  });
}

test('failed wallet switch keeps Settings actions and polling alive', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Settings owns the mobile wallet picker');
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    const originalSync = walletService.syncStatus.bind(walletService);
    Object.assign(window, { syncCalls: 0 });
    walletService.syncStatus = async () => {
      (window as any).syncCalls++;
      return originalSync();
    };
    walletService.selectWallet = async () => {
      throw new Error('synthetic selection failure');
    };
    const connectionStatus = await walletService.testNodeConnection();
    walletService.testNodeConnection = () =>
      new Promise((resolve) => {
        Object.assign(window, {
          finishConnection: () => resolve(connectionStatus)
        });
      });
  });
  await page.locator('a[href="/settings"]:visible').first().click();
  const connection = page.getByRole('button', { name: /^Test connection/ });
  await connection.click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).finishConnection))
    .toBe('function');
  await page
    .locator('.mobile-wallet-manager')
    .getByRole('button', { name: 'Family wallet', exact: true })
    .click();
  await expect(page.getByText('Wallet not switched', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).finishConnection());
  await expect(connection).toBeEnabled();
  const count = await page.evaluate(() => (window as any).syncCalls);
  await expect
    .poll(() => page.evaluate(() => (window as any).syncCalls), { timeout: 7000 })
    .toBeGreaterThan(count);
  await expect(page.getByRole('heading', { name: 'Everyday wallet settings' })).toBeVisible();
});

for (const success of [true, false]) {
  test(`rescan final status ${success ? 'success' : 'failure'} stays quiet after leaving`, async ({
    page
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService } = await import(path);
      const snapshot = await walletService.snapshot();
      const status = await walletService.recoveryScanStatus();
      const reads: Array<(ok: boolean) => void> = [];
      let completed = false;
      walletService.fullRescan = () =>
        new Promise((resolve) => {
          Object.assign(window, {
            finishRescan: () => {
              completed = true;
              resolve(snapshot);
            }
          });
        });
      walletService.recoveryScanStatus = () =>
        completed
          ? new Promise((resolve, reject) => {
              reads.push((ok) =>
                ok ? resolve(status) : reject(new Error('obsolete scan status'))
              );
            })
          : Promise.resolve(status);
      Object.assign(window, {
        scanReads: reads,
        finishScanReads: (ok: boolean) => reads.forEach((finish) => finish(ok))
      });
    });
    await page.locator('a[href="/settings"]:visible').first().click();
    await page.getByRole('button', { name: /Recovery scan/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Full wallet rescan' });
    await dialog.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
    await dialog.getByRole('button', { name: 'Save & rescan' }).click();
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).finishRescan))
      .toBe('function');
    await page.evaluate(() => (window as any).finishRescan());
    await expect
      .poll(() => page.evaluate(() => (window as any).scanReads.length))
      .toBeGreaterThan(0);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/settings$/);
    await page.evaluate((ok) => (window as any).finishScanReads(ok), success);
    await expect(page.getByText('Full rescan complete', { exact: true })).toHaveCount(0);
    await expect(page.getByText('obsolete scan status', { exact: true })).toHaveCount(0);
  });
}

test('pending Settings snapshot survives a rejected selection', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Settings owns the mobile wallet picker');
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    const node = await walletService.nodeConfig();
    walletService.nodeConfig = () =>
      new Promise((resolve) => {
        Object.assign(window, { finishSettingsNode: () => resolve(node) });
      });
    walletService.selectWallet = () =>
      new Promise((_resolve, reject) => {
        Object.assign(window, {
          rejectSelection: () => reject(new Error('synthetic rejected switch'))
        });
      });
    const scan = walletService.recoveryScanSettings.bind(walletService);
    Object.assign(window, { scanSettingsCalls: 0 });
    walletService.recoveryScanSettings = async () => {
      (window as any).scanSettingsCalls++;
      return scan();
    };
  });
  await page.locator('a[href="/settings"]:visible').first().click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).finishSettingsNode))
    .toBe('function');
  await page
    .locator('.mobile-wallet-manager')
    .getByRole('button', { name: 'Family wallet', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).rejectSelection))
    .toBe('function');
  await page.evaluate(() => (window as any).finishSettingsNode());
  await expect.poll(() => page.evaluate(() => (window as any).scanSettingsCalls)).toBe(1);
  await page.evaluate(() => (window as any).rejectSelection());
  await expect(page.getByText('Wallet not switched', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everyday wallet settings' })).toBeVisible();
});
