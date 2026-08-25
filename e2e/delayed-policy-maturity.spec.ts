import { expect, test } from '@playwright/test';

test('shows security-accurate delayed-policy state across overview, coins, and policy', async ({
  page
}) => {
  await page.goto('/?fixture-policy-maturity=1');
  const overview = page.locator('.policy-maturity-banner');
  await expect(overview).toContainText('coins can now be spent with the Recovery key');
  await expect(overview).toContainText('Your normal 2-of-3 keys still work for every coin.');
  await expect(overview).toContainText('Next key change in 820 blocks');
  await overview.getByRole('link', { name: 'Review coins' }).click();

  await expect(page.getByText('Each coin has its own protection timeline')).toBeVisible();
  await expect(page.getByText('Recovery key can spend', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Recovery key locked', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Protection starts after confirmation', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('Recovery key unlocks in 820 blocks', { exact: true })).toBeVisible();
  await page
    .locator('.coin-row')
    .filter({ hasText: 'Recovery key unlocks in 820 blocks' })
    .getByRole('button', { name: /Show details for/ })
    .click();
  await expect(page.getByText('820 blocks remaining', { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByText(
        'Recovery key cannot spend this coin yet. Your normal 2-of-3 keys work now and remain available later.',
        { exact: true }
      )
      .first()
  ).toBeVisible();

  await page.goto('/multisig?fixture-policy-maturity=1');
  await expect(page.getByRole('heading', { name: 'When the extra key can spend' })).toBeVisible();
  await expect(page.getByText('The normal 2-of-3 path remains available.')).toBeVisible();
  await page.getByText('Why this changes your wallet security').click();
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

test('renews one mature coin without merging another coin', async ({ page }) => {
  await page.goto('/coins?fixture-policy-maturity=1');
  const matureCoin = page.locator('.coin-row').filter({ hasText: 'Recovery key can spend' });
  await matureCoin.getByRole('button', { name: /Show details for/ }).click();
  await matureCoin.getByRole('link', { name: 'Renew protection' }).click();

  await expect(page).toHaveURL(/renewProtection=1/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Renew protection' })).toBeVisible();
  await expect(
    page.getByText('Only this coin moves. Its protection restarts after the new coin confirms.')
  ).toBeVisible();
  await expect(page.getByText(/No other coin is combined/)).not.toBeVisible();
  await page.getByText('How it works').click();
  await expect(page.getByText(/No other coin is combined/)).toBeVisible();
  await expect(page.getByText(/gets a fresh 4,320-block wait/)).toBeVisible();
  await page.getByLabel('Permanent transaction label').fill('Renew savings protection');
  await page.getByRole('button', { name: 'Review protection renewal' }).click();

  await expect(page.getByText('New protected coin')).toBeVisible();
  await expect(page.getByText('Protection restarts after confirmation')).toBeVisible();
  await expect(
    page.locator('.selection-review').filter({ hasText: '1 funding coin' })
  ).toBeVisible();
  await expect(
    page.getByText(/Only this coin moves. The network fee is the only amount leaving your wallet/)
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign with device' })).toBeVisible();
});

test('pauses exact countdowns when the verified chain tip is stale', async ({ page }) => {
  await page.goto('/coins?fixture-policy-maturity=1&fixture-stale-tip=1');
  await expect(
    page.getByText(
      'Exact countdowns are paused because the last verified chain tip is stale or unavailable.'
    )
  ).toBeVisible();
  await expect(page.getByText(/unlocks in .* blocks/)).toHaveCount(0);
  const details = page.getByRole('button', { name: /Show details for/ }).first();
  await details.click();
  await expect(page.getByText(/Paused · last verified at block/).first()).toBeVisible();
  await expect(page.getByText('Approximate time')).toHaveCount(0);
});

test('localizes maturity state without layout overflow', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('groot-language', 'fr'));
  await page.goto('/multisig?fixture-policy-maturity=1');
  await expect(
    page.getByRole('heading', { name: 'Quand la clé supplémentaire peut dépenser' })
  ).toBeVisible();
  await expect(page.getByText('Le chemin normal 2 sur 3 reste disponible.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
