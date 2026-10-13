import { expect, test } from '@playwright/test';

test('shows security-accurate delayed-policy state across overview, coins, and policy', async ({
  page
}, testInfo) => {
  await page.goto('/?fixture-policy-maturity=1');
  const overview = page.locator('.policy-maturity-banner');
  await expect(overview).toContainText('1 coin can now be spent with the Recovery key');
  await expect(overview).toContainText('Your normal 2-of-3 keys still work for every coin.');
  await expect(overview).toContainText('Next key change in 820 blocks');
  await overview.getByRole('link', { name: 'Review coins' }).click();

  const timelineNote = page.locator('.coin-list > .warning-notice.coin-timeline-note');
  await expect(timelineNote).toContainText('Each coin has its own protection timeline.');
  await expect(timelineNote).toContainText('Your normal keys keep working.');
  await expect(page.getByText('Recovery key can spend', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Backup key protected', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Wait starts after confirmation', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Recovery key available in 820 blocks', { exact: true })
  ).toBeVisible();
  await page
    .locator('.coin-row')
    .filter({ hasText: 'Recovery key available in 820 blocks' })
    .getByRole('button', { name: /Show details for/ })
    .click();
  await expect(page.getByText(/820 blocks remaining/).first()).toBeVisible();
  await expect(
    page
      .getByText(
        'Recovery key cannot spend this coin yet. Your normal 2-of-3 keys work now and remain available later.',
        { exact: true }
      )
      .first()
  ).toBeVisible();

  await page.goto('/multisig?fixture-policy-maturity=1');
  await expect(page.getByText('2 of 3 primary keys', { exact: true })).toBeVisible();
  await expect(page.getByText('Recovery key after wait', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 3 primary keys + recovery key later')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recovery access' })).toBeVisible();
  await expect(
    page.getByText('No action is required. Recovery key is available for 1 coin.')
  ).toBeVisible();
  const accessInsight = page.getByRole('button', { name: 'About backup-key access' });
  if (testInfo.project.name === 'mobile') await accessInsight.click();
  else await accessInsight.hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'Each coin starts its own wait after confirmation'
  );
  await expect(
    page.locator('.policy-maturity-panel').getByRole('link', { name: 'Review coins' })
  ).toBeVisible();
  await expect(page.getByText('Normal keys still work for all 4 coins.')).toBeVisible();
  await expect(page.getByText('Next change in 820 blocks.')).toBeVisible();
  await expect(page.locator('.policy-maturity-facts .info-banner')).toHaveCount(2);
  await expect(page.locator('.policy-maturity-stats')).toHaveCount(0);
  await page.getByText('How backup-key access works').click();
  await expect(
    page.getByText('Open an available coin to use the backup key or restart its wait.')
  ).toBeVisible();
  await expect(page.locator('.policy-access-coins article')).toHaveCount(4);
  await expect(page.getByText('Backup key available', { exact: true })).toBeVisible();
  await expect(page.getByText('Available in 820 blocks', { exact: true })).toBeVisible();
  await expect(page.getByText('Waiting · 4,308 blocks', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\bexpired\b/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('renews one mature coin without merging another coin', async ({ page }) => {
  await page.goto('/coins?fixture-policy-maturity=1');
  const matureCoin = page.locator('.coin-row').filter({ hasText: 'Recovery key can spend' });
  await matureCoin.getByRole('button', { name: /Show details for/ }).click();
  await matureCoin.getByRole('link', { name: 'Restart recovery wait' }).click();

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
  await page.getByLabel('Transaction label').fill('Renew savings protection');
  await page.getByRole('button', { name: 'Review protection renewal' }).click();

  await expect(page.getByText('New protected coin')).toBeVisible();
  await expect(page.getByText('Protection restarts after confirmation')).toBeVisible();
  await expect(page.getByText('Exact strategy comparison')).toHaveCount(0);
  await expect(
    page.getByText(/Only this coin moves. The network fee is the only amount leaving your wallet/)
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign with device' })).not.toBeVisible();
  await expect(page.getByText('Use offline PSBT signing for this delayed policy.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save PSBT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import signed PSBT' })).toBeVisible();
});

test('keeps mature-coin selection calm and moves secondary actions into overflow', async ({
  page
}) => {
  await page.goto('/coins?fixture-policy-maturity=1');
  const matureCoin = page.locator('.coin-row').filter({ hasText: 'Recovery key can spend' });
  await matureCoin.getByRole('checkbox').check();

  const toolbar = page.locator('.coin-toolbar');
  await expect(toolbar.getByRole('link', { name: 'Send selected coin' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Sort coins' })).toHaveCount(0);
  await expect(toolbar.getByRole('link', { name: 'Use recovery key' })).toHaveCount(0);
  await expect(toolbar.getByRole('link', { name: 'Restart recovery wait' })).toHaveCount(0);
  await expect(toolbar.getByRole('menuitem', { name: /Freeze selected/ })).toHaveCount(0);

  const more = toolbar.getByRole('button', { name: 'More actions for selected coin' });
  await more.click();
  await expect(toolbar.getByRole('menuitem', { name: /Use recovery key/ })).toBeVisible();
  await expect(toolbar.getByRole('menuitem', { name: /Restart recovery wait/ })).toBeVisible();
  await expect(toolbar.getByRole('menuitem', { name: /Freeze selected/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
});

test('organizes optional coin details for recovery and inheritance wallets', async ({ page }) => {
  for (const fixture of [
    {
      query: 'fixture-policy-maturity=1',
      badge: 'Recovery key can spend',
      delayedAction: 'Use recovery key',
      renewalAction: 'Restart recovery wait'
    },
    {
      query: 'fixture-policy-inheritance=1',
      badge: 'Heir key can spend',
      delayedAction: 'Use heir key',
      renewalAction: 'Postpone heir access'
    }
  ]) {
    await page.goto(`/coins?${fixture.query}`);
    const coin = page.locator('.coin-row').filter({ hasText: fixture.badge });
    await coin.getByRole('button', { name: /Show details for/ }).click();
    await expect(coin.locator('.coin-detail-chevron')).toHaveCount(2);
    await expect(coin.getByRole('link', { name: fixture.delayedAction })).toBeVisible();
    await expect(coin.getByRole('link', { name: fixture.renewalAction })).toBeVisible();

    const privacy = coin.locator('details.coin-detail-group').nth(0);
    await privacy.getByText('Privacy & history', { exact: true }).click();
    await expect(privacy.getByRole('term').filter({ hasText: /^Provenance/ })).toBeVisible();
    await expect(privacy.getByRole('term').filter({ hasText: /^Privacy clusters/ })).toBeVisible();
    expect(await privacy.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe('0px');

    const technical = coin.locator('details.coin-detail-group').nth(1);
    await technical.getByText('Technical details', { exact: true }).click();
    await expect(technical.getByText('Confirmations', { exact: true })).toBeVisible();
    await expect(technical.getByText('Address', { exact: true })).toBeVisible();
    await expect(technical.getByText('Outpoint', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  }
});

test('spends one mature coin with only its recovery key', async ({ page }) => {
  await page.goto('/coins?fixture-policy-maturity=1');
  const matureCoin = page.locator('.coin-row').filter({ hasText: 'Recovery key can spend' });
  await matureCoin.getByRole('button', { name: /Show details for/ }).click();
  await expect(matureCoin.getByText('No action is required')).toBeVisible();
  await expect(matureCoin.getByText('Spending access', { exact: true })).toBeVisible();
  await expect(matureCoin.getByText('Privacy & history', { exact: true })).toBeVisible();
  await expect(matureCoin.getByText('Technical details', { exact: true })).toBeVisible();
  await matureCoin.getByRole('link', { name: 'Use recovery key' }).click();

  await expect(page.getByRole('heading', { name: 'Use recovery key' })).toBeVisible();
  await expect(page.getByText('The recovery key signs alone.')).toBeVisible();
  await expect(page.getByText('Network fee · 7 sat/vB')).toBeVisible();
  await page
    .getByLabel('Bitcoin address')
    .fill('bcrt1qrecoverydestination00000000000000000000000000');
  await page.getByLabel('Label', { exact: true }).fill('Emergency recovery');
  await page.getByRole('button', { name: 'Review recovery key payment' }).click();

  await expect(page.getByText('Signed by the recovery key')).toBeVisible();
  await page.getByText('View more details').click();
  await expect(page.getByText('recovery key only')).toBeVisible();
  await expect(page.getByText('Recovery key', { exact: true }).last()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('2 of 4');
});

test('offers the recovery-key route from a normal payment without mixing signer roles', async ({
  page
}) => {
  await page.goto('/multisig/send?fixture-policy-maturity=1');
  const signers = page.locator('.send-signers');
  await expect(signers).toContainText('2 of 3');
  await expect(signers).not.toContainText('Recovery key');
  const recoveryOption = page.locator('.recovery-key-option');
  await expect(recoveryOption).toContainText('Your recovery key can spend 1 coin');
  await recoveryOption.getByRole('link', { name: 'Use recovery key' }).click();
  await expect(page).toHaveURL(/delayedSpend=1/);
  await expect(page.getByRole('heading', { name: 'Use recovery key' })).toBeVisible();
});

test('pauses exact countdowns when the verified chain tip is stale', async ({ page }) => {
  await page.goto('/coins?fixture-policy-maturity=1&fixture-stale-tip=1');
  await expect(
    page.getByText(
      'Exact countdowns are paused because the last verified chain tip is stale or unavailable.'
    )
  ).toBeVisible();
  await expect(page.getByText(/available in .* blocks/)).toHaveCount(0);
  const details = page.getByRole('button', { name: /Show details for/ }).first();
  await details.click();
  await expect(page.getByText(/Paused · last verified at block/).first()).toBeVisible();
  await expect(page.getByText('Approximate time')).toHaveCount(0);
});

test('localizes maturity state without layout overflow', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('groot-language', 'fr'));
  await page.goto('/multisig?fixture-policy-maturity=1');
  await expect(page.getByText('2 clés principales sur 3', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Clé de récupération après l’attente', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accès de récupération' })).toBeVisible();
  await expect(
    page.getByText('Les clés normales fonctionnent toujours pour les 4 pièces.')
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
