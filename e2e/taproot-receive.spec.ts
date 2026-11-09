import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function openAddressOptions(page: Page) {
  const addressType = page.getByRole('combobox', { name: 'Address type' });
  await expect(addressType).toBeHidden();
  await page.getByText('Address options', { exact: true }).click();
  await expect(addressType).toHaveValue('nativeSegwit');
  return addressType;
}

async function expectAddressTypeExplanation(page: Page, copy: string) {
  await page.getByRole('button', { name: 'About address type' }).click();
  await expect(page.getByRole('tooltip')).toHaveText(copy);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
}

test('chooses Taproot explicitly, saves its descriptor, and creates a permanently labelled request', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('groot-theme', 'dark');
    let copied = '';
    let first = true;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          if (first) {
            first = false;
            throw new Error('Synthetic clipboard denial');
          }
          copied = value;
        },
        readText: async () => copied
      }
    });
  });
  await page.goto('/welcome?fixture-empty=1');
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await page.getByRole('button', { name: /Software wallet/ }).click();
  await expect(page.getByRole('button', { name: 'Generate 24 recovery words' })).toBeEnabled();
  await expect(page.getByText('Address options', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('software-default-dark.png') });
  const addressType = await openAddressOptions(page);
  await expectAddressTypeExplanation(
    page,
    'Native SegWit is the default. Taproot uses a different address format.'
  );
  await addressType.selectOption('taproot');
  await expect(page.getByRole('note')).toContainText('public descriptor');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath('taproot-create-dark.png') });
  await page.getByText('Address options', { exact: true }).click();
  await expect(addressType).toBeHidden();
  await expect(page.getByRole('note')).toContainText('public descriptor');
  await page.getByRole('button', { name: 'Generate 24 recovery words' }).click();
  await page.getByRole('button', { name: /Reveal words/i }).click();
  await page.getByRole('button', { name: 'I wrote them down' }).click();
  await page.getByRole('button', { name: 'Verify later' }).click();
  await page.getByLabel('Wallet name').fill('Taproot fixture');
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('synthetic-test-passphrase');
  await page
    .getByLabel('Confirm wallet passphrase', { exact: true })
    .fill('synthetic-test-passphrase');
  await page.getByLabel(/I understand this exact passphrase/).check();
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Wallet created' })).toBeVisible();
  await expect(page.getByText(/Save the public descriptor with your 24 words/)).toBeVisible();
  const copyDescriptor = page.getByRole('button', { name: 'Copy wallet descriptor' });
  await copyDescriptor.click();
  await expect(page.getByRole('alert')).toContainText('Could not copy the public descriptor.');
  await copyDescriptor.click();
  const savedDescriptor = await page.evaluate(() => navigator.clipboard.readText());
  expect(savedDescriptor).toMatch(/^tr\(\[.*\/86'.*\]tpub-groot-demo\/<0;1>\/\*\)#[a-z0-9]{8}$/);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Open wallet' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Public wallet descriptor/ }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Public wallet descriptor' });
  await exportDialog.getByRole('button', { name: 'Copy exact Descriptor' }).click();
  await expect(exportDialog.getByRole('button', { name: 'Copy exact Descriptor' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(savedDescriptor);
  await expectNoHorizontalOverflow(page);
  await exportDialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('link', { name: 'Receive', exact: true }).click();
  await page.getByRole('button', { name: 'New address', exact: true }).click();
  const generate = page.getByRole('button', { name: 'Generate address' });
  await expect(generate).toBeDisabled();
  await page.getByLabel('Label', { exact: true }).fill('Taproot fixture payment');
  await generate.click();
  await expect(page.getByRole('button', { name: /View Taproot fixture payment/ })).toBeVisible();
  await expect(page.getByText('Taproot · BIP86', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show address details' }).click();
  await expect(page.getByText('Taproot · BIP86', { exact: true })).toBeVisible();
  await expect(page.getByText("m/86'/1'/0'/0/0", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^bcrt1pdummy/);
  await expectAddressTypeExplanation(
    page,
    'This is how your wallet receives bitcoin. Use the same address type to recover it.'
  );
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  const discard = page.getByRole('dialog', { name: 'Discard Taproot fixture payment?' });
  await discard.getByText('Show address details', { exact: true }).click();
  await expect(discard.getByText('Taproot · BIP86', { exact: true })).toBeVisible();
  await discard.getByRole('button', { name: 'Keep address' }).click();
  await expectNoHorizontalOverflow(page);
});

test('requires a public Taproot recovery descriptor and permits retry without retaining the passphrase', async ({
  page
}) => {
  await page.addInitScript(() => localStorage.setItem('groot-theme', 'light'));
  await page.goto('/welcome?fixture-empty=1');
  await page.getByRole('button', { name: 'Recover software wallet' }).click();
  const descriptor = page.getByRole('textbox', { name: 'Public wallet descriptor' });
  await expect(page.getByText('Address options', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('recovery-default-light.png') });
  const addressType = await openAddressOptions(page);
  await expectAddressTypeExplanation(
    page,
    'Match the type in your backup. A different type opens a different wallet.'
  );
  await expect(descriptor).toHaveCount(0);
  await addressType.selectOption('taproot');
  await expect(descriptor).toBeVisible();
  await page.getByLabel('Wallet name').fill('Recovered fixture');
  const passphrase = page.getByLabel('Wallet passphrase', { exact: true });
  await passphrase.fill('synthetic-test-passphrase');
  const submit = page.getByRole('button', { name: 'Enter recovery words securely' });
  await expect(submit).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath('taproot-recover-light.png') });
  await page.getByText('Address options', { exact: true }).click();
  await expect(descriptor).toBeVisible();
  await descriptor.fill('synthetic-invalid-descriptor');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText(
    'Enter the saved public Taproot descriptor to recover this wallet.'
  );
  await expect(passphrase).toHaveValue('');

  await page.getByText('Address options', { exact: true }).click();
  await addressType.selectOption('nativeSegwit');
  await addressType.selectOption('taproot');
  await expect(descriptor).toHaveValue('');
  await descriptor.fill('tr(synthetic-corrected-descriptor)');
  await passphrase.fill('synthetic-test-passphrase');
  await expect(submit).toBeEnabled();
  await expect(page.getByLabel('Recovery words')).toHaveCount(0);
});

test('keeps Taproot hidden on the native phone flow and discloses the hardware account limit', async ({
  page
}) => {
  await page.goto('/welcome?add=1&fixture-native-mobile=1');
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await page.getByRole('button', { name: /Software wallet/ }).click();
  await expect(page.getByRole('heading', { name: 'Generate wallet' })).toBeVisible();
  await expect(page.getByText('Address options', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /Hardware signer/ }).click();
  await expect(
    page.getByText('Groot imports Native SegWit (BIP84) hardware accounts.')
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Regtest Continuity rehearsal uses manual accounts and requires the exact recovery backup', async ({
  page
}) => {
  await page.route('**/src/lib/wallet/index.ts*', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    // Exercise UI gates at the composition boundary without simulating signatures.
    const setupFixture = `
      const readFixtureRuntime = walletService.runtimePlatform.bind(walletService);
      walletService.runtimePlatform = async () => ({
        ...await readFixtureRuntime(), platform: 'macos', mobile: false, network: 'regtest'
      });
      walletService.analyzeRecoveryPolicy = async (template, signers, walletName) => {
        if (
          template.type !== 'family_continuity_taproot_v1' ||
          signers.length !== 7 ||
          !signers.every(signer => signer.source === 'manual' && signer.derivationPath === "m/48'/1'/0'/3'") ||
          walletName !== 'Offline family fixture'
        ) throw new Error('Synthetic rehearsal received unexpected setup data');
        return {
          externalDescriptor: 'tr(synthetic-family-policy/0/*)',
          internalDescriptor: 'tr(synthetic-family-policy/1/*)',
          encodedBackup: '{"fixture":"verified-regtest-family-backup"}',
          firstAddress: 'bcrt1pdummyfamilyfirstaddress'
        };
      };
      walletService.savePublicBackup = async (filename, encoded) => {
        if (
          !filename.endsWith('-taproot-backup.json') ||
          encoded !== '{"fixture":"verified-regtest-family-backup"}'
        ) throw new Error('Synthetic rehearsal expected the native backup response unchanged');
        return { saved: true };
      };
    `;
    await route.fulfill({ response, body: `${original}\n${setupFixture}` });
  });
  await page.goto('/multisig/new');
  await page.getByRole('button', { name: /^Partner continuity/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const partnerType = await openAddressOptions(page);
  await partnerType.selectOption('taproot');
  await expect(page.getByText('Regtest only. Sign offline with Bitcoin Core.')).toBeVisible();
  await partnerType.selectOption('nativeSegwit');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('button', { name: /^Family continuity/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Address options', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('continuity-default.png') });
  const familyType = await openAddressOptions(page);
  await expectAddressTypeExplanation(
    page,
    'Choose the format for this wallet’s receive and change addresses.'
  );
  await familyType.selectOption('taproot');
  const requirement = page.getByText('Regtest only. Sign offline with Bitcoin Core.');
  await expect(requirement).toBeVisible();
  await expect(page.getByText('Offline PSBT only', { exact: true })).toHaveCount(0);
  const note = await requirement.boundingBox();
  const timeline = await page.locator('.continuity-path-visual').boundingBox();
  expect(timeline!.y - (note!.y + note!.height)).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: test.info().outputPath('continuity-taproot.png') });
  await page.getByLabel('Wallet name').fill('Offline family fixture');
  await page.getByRole('button', { name: 'Continue to signers' }).click();
  for (let index = 0; index < 7; index++) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Enter public signer key' });
    await expect(dialog.getByText("m/48'/1'/0'/3'", { exact: false })).toBeVisible();
    await expect(dialog.getByText('Import public-key file')).toHaveCount(0);
    await dialog.getByLabel('Signer label').fill(`Offline fixture ${index}`);
    await dialog.getByLabel('Master fingerprint').fill(index.toString(16).padStart(8, '0'));
    await dialog.getByLabel('Account xpub').fill(`tpub-synthetic-offline-signer-${index}`);
    await dialog.getByRole('button', { name: 'Add key' }).click();
  }
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  const save = page.getByRole('button', { name: 'Save Groot JSON backup' });
  const firstAddress = page.getByLabel(/First receive address from Bitcoin Core/);
  await expect(save).toBeDisabled();
  await firstAddress.fill('bcrt1pdummywrongfamilyaddress');
  await expect(save).toBeDisabled();
  await firstAddress.fill('bcrt1pdummyfamilyfirstaddress');
  await save.click();
  await expect(page.getByLabel('App PIN', { exact: true })).toBeEnabled();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
