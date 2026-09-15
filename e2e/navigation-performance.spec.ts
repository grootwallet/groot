import { expect, test } from '@playwright/test';

test('history pages globally filter and sort, retaining the first page on retry', async ({
  page
}) => {
  await page.goto('/activity?fixture-large-history=1&fixture-history-page-error=1');
  await expect(page.locator('.tx-row')).toHaveCount(50);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(
    page.getByRole('alert').getByText('Transactions are unavailable', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.tx-row')).toHaveCount(50);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.tx-row')).toHaveCount(100);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.tx-row')).toHaveCount(120);
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
  await page.getByPlaceholder('Search labels').fill('history 119');
  await expect(page.locator('.tx-row')).toHaveCount(1);
  await expect(page.locator('.tx-row')).toContainText('Synthetic history 119');
  await page.getByPlaceholder('Search labels').fill('');
  await page.locator('.activity-controls select').selectOption('largest');
  await expect(page.locator('.tx-row').first()).toContainText('Synthetic history 119');
  await expect(page.locator('.tx-row')).toHaveCount(50);
  await page.getByRole('button', { name: 'Received', exact: true }).click();
  await expect(page.locator('.tx-row').first()).toContainText('Synthetic history 118');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', page.viewportSize()!.width);
});

test('paged activity stays within the viewport in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
    await page.goto('/activity?fixture-large-history=1');
    await expect(page.locator('.tx-row')).toHaveCount(50);
    await page.screenshot({ path: test.info().outputPath(`activity-${theme}.png`) });
    await page.getByRole('button', { name: 'Load more', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`activity-footer-${theme}.png`) });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', page.viewportSize()!.width);
  }
});

test('overview keeps committed wallet data calm while secondary details are still pending', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-08T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-08T00:00:01Z'));
  await page.goto('/?fixture-delayed-wallet-details=1', { waitUntil: 'commit' });
  await expect(page.locator('.balance-card')).toBeVisible();
  await expect(page.getByText('Loading wallet details…', { exact: true })).toHaveCount(0);
  await page.clock.runFor(1600);
  await expect(page.locator('.balance-card')).toBeVisible();
  await expect(page.getByText('Loading wallet details…', { exact: true })).toHaveCount(0);
});

test('overview retains wallet data when secondary details fail and offers retry', async ({
  page
}) => {
  await page.goto('/?fixture-wallet-details-error=1');
  await expect(page.locator('.balance-card')).toBeVisible();
  await expect(
    page.getByRole('alert').getByText('Wallet details are unavailable', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('alert').getByText('Wallet details are unavailable', { exact: true })
  ).toHaveCount(0);
  await expect(page.locator('.balance-card')).toBeVisible();
});

test('saved signer identity appears before the slow coin snapshot on Send', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-08T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-08T00:00:01Z'));
  await page.goto('/send?fixture-delayed-wallet-data=1', { waitUntil: 'commit' });
  await expect(page.locator('.send-signers')).toBeVisible();
  await expect(page.locator('.send-signers')).not.toHaveClass(/loading/);
  await expect(page.getByRole('button', { name: 'Continue to amount' })).toBeDisabled();
  await page.clock.runFor(1000);
});
