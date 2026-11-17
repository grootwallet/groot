import { expect, test, type Page } from '@playwright/test';

async function expectContainedWalletDialog(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Wallets' });
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize();
  const dialogBounds = await dialog.boundingBox();
  const addWallet = dialog.getByRole('link', { name: 'Add wallet', exact: true });
  const addWalletBounds = await addWallet.boundingBox();
  expect(viewport && dialogBounds && addWalletBounds).toBeTruthy();
  expect(dialogBounds!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.y + dialogBounds!.height).toBeLessThanOrEqual(viewport!.height);
  expect(addWalletBounds!.y + addWalletBounds!.height).toBeLessThanOrEqual(
    dialogBounds!.y + dialogBounds!.height
  );
  await expect(dialog.getByTestId('mobile-wallet-list-scroll')).toHaveCSS('overflow-y', 'auto');

  const wallets = dialog.locator('.wallet-profile-list button');
  await expect(wallets).toHaveCount(2);
  await expect(dialog.locator('.wallet-profile-list button.active')).toHaveCount(1);
  const selected = dialog.locator('.wallet-profile-list button.active');
  await expect(selected).toHaveAttribute('aria-current', 'true');
  const selectedBounds = await selected.boundingBox();
  const listBounds = await dialog.locator('.wallet-profile-list').boundingBox();
  expect(selectedBounds && listBounds).toBeTruthy();
  expect(selectedBounds!.x).toBeCloseTo(listBounds!.x, 1);
  expect(selectedBounds!.width).toBeCloseTo(listBounds!.width, 1);
  expect(await selected.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)'
  );
  return dialog;
}

test('short native-mobile shell keeps wallet choices and navigation targets contained', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile-only shell containment');
  for (const height of [750, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.goto('/?fixture-native-mobile=1');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();

    const navigation = page.locator('.mobile-nav');
    const selectedNavigation = navigation.getByRole('link', { name: 'Overview', exact: true });
    const navigationBounds = await navigation.boundingBox();
    const selectedNavigationBounds = await selectedNavigation.boundingBox();
    expect(navigationBounds && selectedNavigationBounds).toBeTruthy();
    expect(navigationBounds!.x).toBeGreaterThan(0);
    expect(navigationBounds!.y + navigationBounds!.height).toBeLessThan(height);
    expect(selectedNavigationBounds!.width).toBeGreaterThanOrEqual(44);
    expect(selectedNavigationBounds!.height).toBeGreaterThanOrEqual(44);
    expect(selectedNavigationBounds!.y).toBeGreaterThan(navigationBounds!.y);
    expect(selectedNavigationBounds!.y + selectedNavigationBounds!.height).toBeLessThan(
      navigationBounds!.y + navigationBounds!.height
    );
    expect(
      await selectedNavigation.evaluate((element) => getComputedStyle(element).backgroundColor)
    ).not.toBe('rgba(0, 0, 0, 0)');

    await page.getByRole('button', { name: 'Switch wallet' }).click();
    const dialog = await expectContainedWalletDialog(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await dialog.screenshot({
      animations: 'disabled',
      path: info.outputPath(`wallet-selector-${height}.png`)
    });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
});

test('Coins uses a concise empty selection with wallet actions on Overview', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile-only quick actions');
  await page.setViewportSize({ width: 390, height: 750 });

  await page.goto('/coins?fixture-native-mobile=1&fixture-empty-wallet=1');
  await expect(page.getByRole('heading', { name: 'No coins yet' })).toBeVisible();
  await expect(page.locator('.coin-selection-empty')).toHaveText('No coins selected');
  await expect(page.locator('.coin-selection-count')).toHaveCount(0);
  await expect(
    page.getByText('Automatic selection remains the default', { exact: true })
  ).toHaveCount(0);
  await expect(page.locator('.mobile-actions')).toHaveCount(0);

  await page.goto('/coins?fixture-native-mobile=1');
  await expect(page.locator('.coin-list .coin-row').first()).toBeVisible();
  await expect(page.locator('.mobile-actions')).toHaveCount(0);
  await expect(page.locator('.mobile-nav').getByRole('link', { name: 'Overview' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
