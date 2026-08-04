import { expect, test } from '@playwright/test';

const keys = [
  { label: 'Coldcard', fingerprint: 'a1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-1' },
  { label: 'Ledger', fingerprint: 'b1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-2' },
  { label: 'Trezor', fingerprint: 'c1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-3' }
];
const recoveryKey = { label: 'Recovery key', fingerprint: 'd1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-4' };

test('spends end-to-end from the ready-made demo vault', async ({ page }) => {
  await page.goto('/multisig');
  await expect(page.getByRole('heading', { name: 'Family vault' })).toBeVisible();
  await expect(page.getByText('Ready-to-test demo vault')).toBeVisible();
  await expect(page.getByText('2,481,240 sats')).toBeVisible();
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Amount').fill('50000');
  await page.getByRole('button', { name: 'Review multisig payment' }).click();
  for (const progress of ['1 of 2 collected', '2 of 2 collected']) {
    await page.getByRole('button', { name: 'Sign with device' }).click();
    await page.getByRole('button', { name: /Virtual Coldcard/ }).click();
    await expect(page.getByText(progress)).toBeVisible();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Finalize & broadcast' }).click();
  await expect(page.getByRole('heading', { name: 'Transaction broadcast' })).toBeVisible();
  await expect(page.getByText('Balance 2,429,700 sats')).toBeVisible();
});

test('shows cosigner details and runs honest health checks', async ({ page }) => {
  await page.goto('/multisig');

  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  const coldcardDialog = page.getByRole('dialog', { name: 'Coldcard' });
  await expect(coldcardDialog).toBeVisible();
  await expect(coldcardDialog.getByText('f00dbabe', { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText("m/48'/1'/0'/2'", { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText('Not checked in this session')).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'Run health check' }).click();
  await expect(coldcardDialog.getByText('Connected identity matches f00dbabe.')).toBeVisible();
  await expect(coldcardDialog.getByText(/Last checked/)).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'View Offline backup details' }).click();
  const backupDialog = page.getByRole('dialog', { name: 'Offline backup' });
  await backupDialog.getByRole('button', { name: 'Run health check' }).click();
  await expect(backupDialog.getByText(/Physical presence cannot be checked for an offline key/)).toBeVisible();
});

test('offers safe recipes and advanced M-of-N control', async ({ page }) => {
  await page.goto('/multisig/new');
  await expect(page.getByText('2 of 3', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /3 of 5/ }).click();
  await expect(page.locator('.policy-pill')).toHaveText('3 of 5');
  await page.getByRole('button', { name: /Custom/ }).click();
  await page.getByLabel('Total cosigners').selectOption('4');
  await page.getByLabel('Signatures required').selectOption('3');
  await expect(page.locator('.policy-pill')).toHaveText('3 of 4');
  await expect(page.getByLabel('Signatures required').locator('option[value="1"]')).toHaveCount(0);
  await expect(page.getByText(/1-of-N wallet has no multisig theft protection/)).toBeVisible();
});

test('creates and verifies a simple 2-of-3 descriptor wallet', async ({ page }) => {
  await page.goto('/multisig/new');
  await expect(page.getByRole('heading', { name: 'Create a multisig wallet' })).toBeVisible();
  await page.getByLabel('Wallet name').fill('Family vault');

  for (const key of keys) {
    await page.getByRole('button', { name: 'Add a cosigner' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Cosigner label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
    await expect(page.getByText(key.label, { exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Review wallet' }).click();
  await expect(page.getByText('2 of 3 signatures')).toBeVisible();
  await page.getByRole('button', { name: 'Descriptor logic' }).click();
  await expect(page.getByTestId('descriptor-preview')).toContainText('wsh(sortedmulti(2,');
  await page.getByLabel('I saved the wallet descriptor').check();
  await page.getByLabel('App PIN', { exact: true }).fill('coordinator-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();

  await expect(page).toHaveURL(/\/multisig$/);
  await expect(page.getByRole('heading', { name: 'Family vault' })).toBeVisible();
  await expect(page.locator('header').getByText('2 of 3')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Receive' }).click();
  await expect(page.getByRole('heading', { name: 'Receive to vault' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code for/ })).toBeVisible();

  await page.getByRole('link', { name: 'Back to vault' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Send' }).click();
  await page.getByLabel('Bitcoin address').fill('bcrt1qvaultdestination0000000000000000000000000');
  await page.getByLabel('Amount').fill('50000');
  await page.getByRole('button', { name: 'Review multisig payment' }).click();
  await expect(page.getByText('0 of 2 collected')).toBeVisible();
  for (const progress of ['1 of 2 collected', '2 of 2 collected']) {
    await page.getByRole('button', { name: 'Sign with device' }).click();
    await page.getByRole('button', { name: /Virtual Coldcard/ }).click();
    await expect(page.getByText(progress)).toBeVisible();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('wrong-pin');
  await page.getByRole('button', { name: 'Finalize & broadcast' }).click();
  await expect(page.getByText('Incorrect app PIN.')).toBeVisible();
  await page.getByLabel('App PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Finalize & broadcast' }).click();
  await expect(page.getByRole('heading', { name: 'Transaction broadcast' })).toBeVisible();

  await page.getByRole('link', { name: 'Return to vault' }).click();
  await page.getByRole('link', { name: 'Export & verify' }).click();
  await page.getByLabel('Backup app PIN', { exact: true }).fill('wrong-pin');
  await page.getByRole('button', { name: 'Export descriptor backup' }).click();
  await expect(page.getByText('Incorrect app PIN.')).toBeVisible();
  await page.getByLabel('Backup app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Export descriptor backup' }).click();
  await expect(page.getByLabel('Descriptor backup')).toHaveValue(/"network": "regtest"/);
  const descriptorBackup = await page.getByLabel('Descriptor backup').inputValue();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save file' }).click();
  await expect((await downloadPromise).suggestedFilename()).toBe('satchel-descriptor-backup.json');
  await page.getByLabel('Backup file import').setInputFiles({
    name: 'satchel-descriptor-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(descriptorBackup),
  });
  await expect(page.getByText('Backup file loaded')).toBeVisible();
  await page.getByRole('button', { name: 'Run recovery drill' }).click();
  await expect(page.getByText('Backup verified')).toBeVisible();
  await page.getByLabel('Vault name confirmation').fill('Family vault');
  await page.getByLabel('Delete vault app PIN', { exact: true }).fill('wrong-pin');
  await page.getByRole('button', { name: 'Delete vault from this device' }).click();
  await expect(page.getByText('Incorrect app PIN.')).toBeVisible();
  await page.getByLabel('Delete vault app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Delete vault from this device' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('button', { name: /Recover descriptor wallet/ }).click();
  await page.getByLabel('Recovery descriptor backup').fill(descriptorBackup);
  await page.getByRole('button', { name: 'Validate backup' }).click();
  await expect(page.getByText('Backup is valid')).toBeVisible();
  await page.getByLabel('I verified the first receive address').check();
  await page.getByLabel('New vault app PIN', { exact: true }).fill('restored-pin');
  await page.getByLabel('Confirm new vault app PIN', { exact: true }).fill('restored-pin');
  await page.getByRole('button', { name: 'Recover vault' }).click();
  await expect(page.getByRole('heading', { name: 'Family vault' })).toBeVisible();
});

test('compiles and simulates guided Miniscript recovery policies', async ({ page }) => {
  await page.goto('/multisig/new');
  await page.getByLabel('Wallet name').fill('Policy lab vault');
  for (const key of keys) {
    await page.getByRole('button', { name: 'Add a cosigner' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Cosigner label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await page.getByLabel('I saved the wallet descriptor').check();
  await page.getByLabel('App PIN', { exact: true }).fill('policy-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('policy-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await page.getByRole('link', { name: 'Recovery policy lab' }).click();
  await page.getByRole('button', { name: 'Compile & analyze policy' }).click();
  await expect(page.getByText('Sanity checked')).toBeVisible();
  await expect(page.getByText('After 4,320 blocks')).toBeVisible();
  await page.getByLabel('Policy template').selectOption('decaying');
  await page.getByRole('button', { name: 'Compile & analyze policy' }).click();
  await expect(page.getByText(/intentionally reduce theft resistance/)).toBeVisible();
});

test('creates a guided recovery descriptor from a visible template', async ({ page }) => {
  await page.goto('/multisig/new');
  await page.getByRole('button', { name: /Recovery path/ }).click();
  await page.getByLabel('Wallet name').fill('Resilient vault');
  for (const key of [...keys, recoveryKey]) {
    await page.getByRole('button', { name: 'Add a cosigner' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Cosigner label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await expect(page.getByText('2 of 4 signatures')).toBeVisible();
  await page.getByRole('button', { name: 'Descriptor logic' }).click();
  await expect(page.getByTestId('descriptor-preview')).toContainText('4,320 blocks');
  await page.getByLabel('I saved the wallet descriptor').check();
  await page.getByLabel('App PIN', { exact: true }).fill('recovery-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('recovery-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Resilient vault' })).toBeVisible();
});

test('blocks a duplicate device before review', async ({ page }) => {
  await page.goto('/multisig/new');
  await page.getByLabel('Wallet name').fill('Duplicate test');
  for (const key of [keys[0], { ...keys[1], fingerprint: keys[0].fingerprint }, keys[2]]) {
    await page.getByRole('button', { name: 'Add a cosigner' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Cosigner label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await expect(page.getByText('Every cosigner must have a unique master fingerprint.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review wallet' })).toBeDisabled();
});

test('coordinator has no horizontal overflow on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout assertion');
  await page.goto('/multisig/new');
  const sizes = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  await expect(page.getByRole('button', { name: 'Add a cosigner' })).toBeVisible();
});
