import { expect, test } from '@playwright/test';

for (const route of ['/send', '/multisig/send']) {
  test(`partial Core estimates stay usable in ${route}`, async ({ page }) => {
    await page.goto(`${route}?fixture-partial-fee-estimates=1`);
    await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
    await page.getByLabel('Payment label').fill('Partial fee fixture');
    await page.getByRole('button', { name: 'Continue to amount' }).click();
    await page.getByLabel('Amount', { exact: true }).fill('1000');
    await expect(page.getByRole('button', { name: /^Economy/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Economy/ })).toContainText('3 sat/vB');
    for (const name of ['Standard', 'Priority']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeDisabled();
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(
        'Unavailable'
      );
    }
    await expect(
      page.getByText('Some fee estimates are unavailable', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review payment' })).toBeDisabled();
    await page.getByRole('button', { name: /^Economy/ }).click();
    await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
    await page.getByRole('button', { name: /^Custom/ }).click();
    await page.getByLabel('Custom fee rate').fill('0');
    await expect(page.getByRole('button', { name: 'Review payment' })).toBeDisabled();
    await page.getByLabel('Custom fee rate').fill('0.5');
    await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await page.screenshot({
        path: test.info().outputPath(`partial-fees-${theme}.png`),
        fullPage: true
      });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}

test('failed and retried health checks leave the Coldcard policy acknowledgement intact', async ({
  page
}) => {
  await page.goto('/multisig');
  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  await page.getByRole('button', { name: 'Review setup' }).click();
  const setup = page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' });
  await setup.getByRole('checkbox').check();
  await setup.getByRole('button', { name: 'Complete policy registration' }).click();
  const row = page.getByRole('button', { name: 'View Coldcard details' });
  await expect(row.getByText('Policy imported', { exact: true })).not.toHaveClass(/attention/);
  await row.click();
  const details = page.getByRole('dialog', { name: 'Coldcard', exact: true });
  await expect(details.getByText(/^Import recorded/)).toBeVisible();
  await expect(details.getByText(/^Last verified/)).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('fixture-health-disconnected', '1'));
  await details.getByRole('button', { name: 'Check signer' }).click();
  await expect(details.getByRole('alert')).toContainText('The saved hardware signer was not found');
  await expect(details.locator('.warning-notice.danger')).toBeVisible();
  await expect(row.getByText('Policy imported', { exact: true })).not.toHaveClass(/attention/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await page.screenshot({
      path: test.info().outputPath(`health-policy-${theme}.png`),
      fullPage: true
    });
  }
  await page.evaluate(() => sessionStorage.removeItem('fixture-health-disconnected'));
  await details.getByRole('button', { name: 'Check signer' }).click();
  await expect(details.getByRole('alert')).toHaveCount(0);
  await expect(
    details.locator('.health-card').getByText('Signer matches this wallet.')
  ).toBeVisible();
  await details.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(row.getByText('Policy imported', { exact: true })).not.toHaveClass(/attention/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
