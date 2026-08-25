import { expect, test } from '@playwright/test';

test('shows security-accurate delayed-policy state across overview, coins, and policy', async ({
  page
}) => {
  await page.goto('/?fixture-policy-maturity=1');
  const overview = page.locator('.policy-maturity-banner');
  await expect(overview).toContainText('coins have a matured delayed path');
  await expect(overview).toContainText(
    'Maturity adds an independent single-key path. The normal 2-of-3 path stays valid.'
  );
  await expect(overview).toContainText('Next change in 820 blocks');
  await overview.getByRole('link', { name: 'Review coins' }).click();

  await expect(page.getByText('Each coin has its own delayed-path clock')).toBeVisible();
  await expect(page.getByText('Delayed path mature', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Delayed path immature', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Delay not started', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('820 blocks to maturity', { exact: true }).first()).toBeVisible();
  await page
    .locator('.coin-row')
    .filter({ hasText: '820 blocks to maturity' })
    .getByRole('button', { name: /Show details for/ })
    .click();
  await expect(page.getByText('820 blocks remaining', { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByText(
        'The independent delayed key can spend alone after maturity. Groot still sends only through the normal 2-of-3 path.',
        { exact: true }
      )
      .first()
  ).toBeVisible();

  await page.goto('/multisig?fixture-policy-maturity=1');
  await expect(page.getByRole('heading', { name: 'Per-coin maturity' })).toBeVisible();
  await expect(page.getByText('The normal 2-of-3 path remains available.')).toBeVisible();
  await page.getByText('How spending authority changes').click();
  await expect(
    page.getByText(
      'Groot does not yet coordinate delayed-key spending. Send remains fail-closed on the reviewed 2-of-3 path.'
    )
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\bexpired\b/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('pauses exact countdowns when the verified chain tip is stale', async ({ page }) => {
  await page.goto('/coins?fixture-policy-maturity=1&fixture-stale-tip=1');
  await expect(
    page.getByText(
      'Exact countdowns are paused because the last verified chain tip is stale or unavailable.'
    )
  ).toBeVisible();
  await expect(page.getByText(/blocks to maturity/)).toHaveCount(0);
  const details = page.getByRole('button', { name: /Show details for/ }).first();
  await details.click();
  await expect(page.getByText(/Paused · last verified at block/).first()).toBeVisible();
  await expect(page.getByText('Approximate time')).toHaveCount(0);
});

test('localizes maturity state without layout overflow', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('groot-language', 'fr'));
  await page.goto('/multisig?fixture-policy-maturity=1');
  await expect(page.getByRole('heading', { name: 'Maturité par pièce' })).toBeVisible();
  await expect(page.getByText('Le chemin normal 2 sur 3 reste disponible.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
