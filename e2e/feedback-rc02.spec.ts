import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  if (process.env.GROOT_E2E_DARK === '1')
    await page.addInitScript(() => localStorage.setItem('groot-theme', 'dark'));
});

test('rc02 hardware app PIN changes authenticate, lock, and keep software credentials fixed', async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /Change app PIN/ })).toHaveCount(0);
  await page.goto('/welcome?add=1');
  await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
  await page.getByRole('button', { name: /Hardware signer/ }).click();
  await page.getByLabel('Wallet name').fill('PIN change test');
  await page.getByRole('button', { name: /Connect with cable/ }).click();
  await page.getByRole('button', { name: /Virtual Coldcard/ }).click();
  await page.getByRole('button', { name: 'Fingerprint matches' }).click();
  await page.getByLabel('App PIN', { exact: true }).fill('old-hardware-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('old-hardware-pin');
  await expect(page.getByText(/network setup/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Change app PIN/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Change app PIN' });
  await dialog.getByLabel('Current app PIN', { exact: true }).fill('wrong-pin');
  await dialog.getByLabel('New app PIN', { exact: true }).fill('new-hardware-pin');
  await dialog.getByLabel('Confirm new app PIN', { exact: true }).fill('mismatch');
  await expect(dialog.getByRole('button', { name: 'Change app PIN' })).toBeDisabled();
  await dialog.getByLabel('Confirm new app PIN', { exact: true }).fill('new-hardware-pin');
  await dialog.getByRole('button', { name: 'Change app PIN' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Incorrect app PIN');
  await expect(dialog.getByLabel('Current app PIN', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Current app PIN', { exact: true }).fill('old-hardware-pin');
  await dialog.getByLabel('New app PIN', { exact: true }).fill('new-hardware-pin');
  await dialog.getByLabel('Confirm new app PIN', { exact: true }).fill('new-hardware-pin');
  while (await page.locator('.toast-close').count()) {
    const count = await page.locator('.toast-close').count();
    await page.locator('.toast-close').first().click({ force: true });
    await expect(page.locator('.toast-close')).toHaveCount(count - 1);
  }
  await page.screenshot({ path: test.info().outputPath('change-pin.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Change app PIN' }).click();
  await expect(page).toHaveURL(/\/unlock/);
  await page.getByLabel('App PIN', { exact: true }).fill('old-hardware-pin');
  await page.getByRole('button', { name: 'Unlock wallet', exact: true }).click();
  await expect(page.getByText('Incorrect passphrase / PIN.', { exact: true })).toBeVisible();
  await page.getByLabel('App PIN', { exact: true }).fill('new-hardware-pin');
  await page.getByRole('button', { name: 'Unlock wallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('rc02 own-node choice opens the connection dialog directly', async ({ page }) => {
  await page.goto('/?fixture-initial-history-required=1');
  const scan = page.getByRole('dialog', { name: 'Approve wallet-history scan' });
  await expect(scan).toContainText('simplicity and speed');
  await page.screenshot({
    path: test.info().outputPath('scan-consent.png'),
    animations: 'disabled'
  });
  await scan.getByRole('button', { name: 'Set up my own node' }).click();
  await expect(page.getByRole('dialog', { name: 'Connect Bitcoin Core' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('node-connection.png'),
    animations: 'disabled'
  });
});

test('initial scan waits for the exact privacy disclosure before approval', async ({ page }) => {
  await page.goto(
    '/?fixture-initial-history-required=1&fixture-managed-node=1&fixture-node-config-delay=1'
  );
  const modal = page.getByRole('dialog', { name: 'Approve wallet-history scan' });
  await expect(modal.getByText('Checking wallet privacy…')).toBeVisible();
  await expect(modal.getByText('Your own node checks your wallet history.')).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Approve and scan' })).toBeDisabled();
  await expect(modal.getByText('Groot’s network can see your wallet activity.')).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Approve and scan' })).toBeEnabled();
});

test('initial scan keeps approval blocked until a failed privacy check is retried', async ({
  page
}) => {
  await page.goto(
    '/?fixture-initial-history-required=1&fixture-managed-node=1&fixture-node-config-error=1'
  );
  const modal = page.getByRole('dialog', { name: 'Approve wallet-history scan' });
  await expect(modal.getByText('Could not check wallet privacy')).toBeVisible();
  await expect(modal.getByText('Your own node checks your wallet history.')).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Approve and scan' })).toBeDisabled();

  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('fixture-node-config-error');
    history.replaceState({}, '', url);
  });
  await modal.getByRole('button', { name: 'Try again' }).click();
  await expect(modal.getByText('Groot’s network can see your wallet activity.')).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Approve and scan' })).toBeEnabled();
});

test('rc02 scan failures use the shared notice and retry after the connection is fixed', async ({
  page
}) => {
  await page.goto('/?fixture-initial-history-required=1&fixture-pruned-history=1');
  const modal = page.getByRole('dialog', { name: 'Approve wallet-history scan' });
  await modal.getByRole('button', { name: 'Approve and scan' }).click();
  await expect(modal.getByRole('alert')).toContainText('Scan could not start');
  await expect(modal.getByRole('alert')).toContainText('Bitcoin Core no longer stores');
  await expect(modal.getByRole('button', { name: 'Approve and scan' })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('scan-error.png'), animations: 'disabled' });
  await page.evaluate(() => history.replaceState({}, '', '/?fixture-initial-history-required=1'));
  await modal.getByRole('button', { name: 'Approve and scan' }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByText('Never synced')).toHaveCount(0);
});

test('rc02 labels identify signer records without calling them unsupported', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /BIP329/ }).click();
  const modal = page.getByRole('dialog', { name: 'BIP329 wallet labels' });
  await modal.getByRole('button', { name: 'Import JSONL' }).click();
  await expect(modal).toContainText('3 signer keys matched');
  await expect(modal.getByText(/unsupported/)).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('label-result.png'),
    animations: 'disabled'
  });
});

test('rc02 receive quorum errors offer a clear policy action', async ({ page }) => {
  await page.goto('/multisig/receive?fixture-selected-multisig=1&fixture-policy-quorum-required=1');
  await page.getByRole('button', { name: 'New receive address' }).click();
  const dialog = page.getByRole('dialog', { name: 'New receive address' });
  await dialog.getByLabel('Label', { exact: true }).fill('Policy test');
  await dialog.getByRole('button', { name: 'Generate address' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Verify this wallet on your hardware signers'
  );
  const policyAction = dialog.getByRole('link', { name: 'Open Policy' });
  await expect(policyAction).toBeVisible();
  await expect(dialog.locator('.instruction-card')).toContainText('Verify your wallet policy');
  while (await page.locator('.toast-close').count()) {
    const count = await page.locator('.toast-close').count();
    await page.locator('.toast-close').first().click({ force: true });
    await expect(page.locator('.toast-close')).toHaveCount(count - 1);
  }
  await page.screenshot({
    path: test.info().outputPath('receive-policy-action.png'),
    animations: 'disabled'
  });
  await policyAction.click();
  await expect(page).toHaveURL(/\/multisig$/);
});
