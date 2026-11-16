import { expect, test } from '@playwright/test';

test.describe('native mobile Overview', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile-only presentation checks');
  });

  test('keeps locked wallet data and quick actions hidden', async ({ page }) => {
    await page.goto('/?fixture-native-mobile=1&fixture-locked-wallet-switch=1');
    await expect(page).toHaveURL(/\/unlock/);
    await expect(page.locator('.balance-card')).toHaveCount(0);
    await expect(page.locator('.mobile-actions')).toHaveCount(0);
  });

  test('shows one setup action without an invented balance or duplicate history warning', async ({
    page
  }) => {
    await page.goto('/?fixture-native-mobile=1&fixture-initial-history-required=1');

    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Set up wallet sync', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Set up sync' })).toHaveCount(0);
    await expect(page.getByText('Total balance', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Never synced', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Wallet history not verified', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent activity' })).toHaveCount(0);

    const actions = page.locator('.mobile-actions');
    await expect(actions.getByRole('link', { name: 'Receive', exact: true })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );

    await page.screenshot({
      path: test.info().outputPath('overview-sync-setup.png'),
      animations: 'disabled'
    });
    await page.getByRole('link', { name: 'Configure sync' }).click();
    await expect(page).toHaveURL(/\/settings#network-services$/);
  });

  test('keeps Receive but omits new Send for a verified empty wallet', async ({ page }) => {
    await page.goto('/?fixture-native-mobile=1&fixture-empty-wallet=1');

    const balance = page.locator('.balance-card');
    await expect(balance).toBeVisible();
    await expect(balance).toContainText('0');
    await expect(balance.getByText('0 sats pending')).toHaveCount(0);
    await expect(page.getByText('No transactions yet', { exact: true })).toBeVisible();

    const actions = page.locator('.mobile-actions');
    await expect(actions.getByRole('link', { name: 'Receive', exact: true })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath('overview-known-zero.png'),
      animations: 'disabled'
    });
  });

  test('shows funded actions and keeps every wallet action reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 750 });
    await page.goto('/?fixture-native-mobile=1&fixture-selected-multisig=1');

    const actions = page.locator('.mobile-actions');
    await expect(actions.getByRole('link', { name: 'Receive', exact: true })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Send', exact: true })).toBeVisible();

    const trigger = page.getByRole('button', { name: 'More wallet actions' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'More wallet actions' });
    await expect(dialog).toBeVisible();
    const lastAction = dialog.getByRole('link', { name: 'Export & verify', exact: true });
    expect((await dialog.boundingBox())!.height).toBeLessThan(page.viewportSize()!.height * 0.6);
    await lastAction.scrollIntoViewIfNeeded();
    await expect(lastAction).toBeVisible();
    const bounds = await lastAction.boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: test.info().outputPath('overview-funded-actions.png'),
      animations: 'disabled'
    });
  });
});
