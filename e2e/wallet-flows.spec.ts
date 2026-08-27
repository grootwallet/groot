import { expect, test, type Page } from '@playwright/test';

async function confirmGeneratedBackup(page: Page) {
  const words = await page.locator('.mnemonic-grid strong').allTextContents();
  expect(words).toHaveLength(24);
  await page.getByRole('button', { name: 'I wrote them down' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your backup' })).toBeVisible();
  const pool = page.getByRole('group', { name: 'Shuffled recovery words' });
  const slots = page.getByRole('list', { name: 'Your recovery word sequence' });
  const availableWord = async (word: string) => {
    const buttons = pool.locator('button:not(:disabled)');
    for (let index = 0; index < (await buttons.count()); index += 1) {
      const candidate = buttons.nth(index);
      if ((await candidate.textContent())?.trim() === word) return candidate;
    }
    throw new Error(`No available recovery-word button for ${word}`);
  };
  const firstWord = await availableWord(words[0]);
  await firstWord.dragTo(slots.locator('li').first());
  await expect(slots.locator('li').first()).toContainText(words[0]);
  await slots
    .getByRole('button', { name: new RegExp(`Remove ${words[0]} from position 1`) })
    .click();
  for (const word of words) {
    await (await availableWord(word)).click();
  }
  await expect(page.getByRole('button', { name: 'Confirm order' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm order' }).click();
}

async function chooseSoftwareWallet(page: Page) {
  await page.getByRole('button', { name: /Software wallet/ }).click();
}

test('creates a 24-word wallet and clears onboarding secrets', async ({ page }) => {
  await page.goto('/welcome?fixture-empty=1');
  await expect(
    page.getByText('Create in Groot, connect existing hardware, or recover a software wallet.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recover software wallet' })).toBeVisible();
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await expect(page.locator('.wallet-type-card')).toHaveCount(3);
  await expect(page.getByText('Create and back up your keys in Groot.')).toBeVisible();
  await expect(page.getByText('Connect a device you already trust.')).toBeVisible();
  await expect(
    page.getByText('Custom spending, recovery, inheritance, or shared control.')
  ).toBeVisible();
  await chooseSoftwareWallet(page);
  const setupProgress = page.getByRole('navigation', { name: 'Software wallet setup progress' });
  await expect(setupProgress).toContainText('Generate');
  await expect(setupProgress).toContainText('Back up');
  await expect(setupProgress).toContainText('Protect');
  await expect(setupProgress.locator('[aria-current="step"]')).toContainText('Generate');
  await page.getByRole('button', { name: 'Generate 24 recovery words' }).click();
  await expect(setupProgress.locator('[aria-current="step"]')).toContainText('Back up');
  await expect(page.getByText('Check your surroundings')).toBeVisible();
  await expect(page.locator('.recovery-reveal-gate')).toContainText(
    'Make sure no person, camera, or screen sharing can see them.'
  );
  await expect(page.locator('.mnemonic-grid > div')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'I wrote them down' })).toBeDisabled();
  await page.getByRole('button', { name: /reveal words/i }).click();
  const recoveryCells = page.locator('.mnemonic-grid > div');
  await expect(recoveryCells).toHaveCount(24);
  const cellPositions = await recoveryCells.evaluateAll((cells) =>
    cells.map((cell) => {
      const box = cell.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y) };
    })
  );
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  const columnLength = isMobile ? 12 : 8;
  const columnCount = isMobile ? 2 : 3;
  for (let column = 0; column < columnCount; column += 1) {
    const start = column * columnLength;
    const end = start + columnLength;
    expect(new Set(cellPositions.slice(start, end).map(({ x }) => x)).size).toBe(1);
    expect(cellPositions[start].y).toBeLessThan(cellPositions[end - 1].y);
    if (column > 0) {
      expect(cellPositions[start - columnLength].x).toBeLessThan(cellPositions[start].x);
    }
  }
  await confirmGeneratedBackup(page);
  await expect(setupProgress.locator('[aria-current="step"]')).toContainText('Protect');
  await expect(setupProgress).not.toContainText('Step 3 of 3');
  await expect(page.getByRole('heading', { name: 'Protect your wallet' })).toBeVisible();
  await expect(page.getByText('Backup confirmed')).toHaveCount(0);
  const acknowledgement = page.locator('.credential-ack');
  const acknowledgementWidths = await acknowledgement.evaluate((element) => {
    const copy = element.querySelector('p');
    return {
      card: element.getBoundingClientRect().width,
      copy: copy?.getBoundingClientRect().width ?? 0
    };
  });
  expect(acknowledgementWidths.copy).toBeGreaterThan(acknowledgementWidths.card * 0.65);
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('a'.repeat(1025));
  await expect(page.getByText('The wallet passphrase is too long.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create wallet' })).toBeDisabled();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('new-wallet-pin');
  await page.getByRole('button', { name: 'Show Wallet passphrase' }).click();
  await expect(page.getByLabel('Wallet passphrase', { exact: true })).toHaveAttribute(
    'type',
    'text'
  );
  await page.getByRole('button', { name: 'Hide Wallet passphrase' }).click();
  await expect(page.getByRole('button', { name: 'Create wallet' })).toBeDisabled();
  await page.getByLabel('Confirm wallet passphrase', { exact: true }).fill('different-pin');
  await expect(page.getByText('Passphrases do not match.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create wallet' })).toBeDisabled();
  await page.getByLabel('Confirm wallet passphrase', { exact: true }).fill('new-wallet-pin');
  await page.getByLabel(/I understand this exact passphrase/).check();
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('can defer seed verification and complete it later from the wallet', async ({ page }) => {
  await page.goto('/welcome?fixture-empty=1');
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await chooseSoftwareWallet(page);
  await page.getByRole('button', { name: 'Generate 24 recovery words' }).click();
  await page.getByRole('button', { name: /reveal words/i }).click();
  await page.getByRole('button', { name: 'I wrote them down' }).click();
  await page.getByRole('button', { name: 'Verify later' }).click();
  await expect(page.getByText('Backup not verified yet')).toBeVisible();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('deferred-backup-passphrase');
  await page
    .getByLabel('Confirm wallet passphrase', { exact: true })
    .fill('deferred-backup-passphrase');
  await page.getByLabel(/I understand this exact passphrase/).check();
  await page.getByRole('button', { name: 'Create wallet' }).click();

  const backupStatus = page.getByRole('region', { name: 'Recovery backup status' });
  await expect(backupStatus.getByText('Recovery backup not verified')).toBeVisible();
  await backupStatus.getByRole('button', { name: 'Verify now' }).click();
  const verifyDialog = page.getByRole('dialog', { name: 'Verify recovery backup' });
  await verifyDialog.getByLabel('Wallet passphrase', { exact: true }).fill('wrong-passphrase');
  await verifyDialog.getByRole('button', { name: 'Continue' }).click();
  await expect(verifyDialog.getByText('Incorrect wallet passphrase.')).toBeVisible();
  await verifyDialog
    .getByLabel('Wallet passphrase', { exact: true })
    .fill('deferred-backup-passphrase');
  await verifyDialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Recovery backup verified', { exact: true })).toBeVisible();
  await expect(backupStatus).toHaveCount(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
});

test('optional physical entropy entry is bounded and cleared after generation', async ({
  page
}) => {
  await page.goto('/welcome?fixture-empty=1');
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await chooseSoftwareWallet(page);
  const generate = page.getByRole('button', { name: 'Generate 24 recovery words' });
  await expect(generate).toBeEnabled();
  await page.getByText('Advanced: add physical randomness').click();
  await expect(
    page.getByText(/always requires 256-bit operating-system randomness/i)
  ).toBeVisible();
  await page.getByRole('button', { name: 'Six-sided die' }).click();
  await expect(generate).toBeDisabled();
  const one = page.getByRole('button', { name: 'Record die result 1' });
  for (let roll = 0; roll < 50; roll += 1) await one.click();
  await expect(page.getByText('50 / 50 minimum')).toBeVisible();
  await expect(generate).toBeEnabled();
  await page.getByRole('button', { name: 'Undo last' }).click();
  await expect(generate).toBeDisabled();
  await page.getByRole('button', { name: 'Record die result 6' }).click();
  await generate.click();
  await expect(page.getByRole('heading', { name: 'Recovery words' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText('Advanced: add physical randomness').click();
  await expect(page.getByText('0 / 50 minimum')).toBeVisible();
  await expect(generate).toBeDisabled();
});

test('keeps recovery words out of the webview and unlock rejects the wrong credential', async ({
  page
}) => {
  await page.goto('/welcome?fixture-empty=1');
  await page.getByRole('button', { name: 'Recover software wallet' }).click();
  await expect(page.getByLabel('Recovery words')).toHaveCount(0);
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Enter recovery words securely' }).click();
  await expect(page.getByText(/native recovery window/)).toBeVisible();
  await expect(page.getByLabel('Wallet passphrase', { exact: true })).toHaveValue('');

  await page.goto('/unlock?fixture-locked-wallet-switch=1');
  await expect(page.getByRole('link', { name: 'Overview' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Activity' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Coins' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use light mode' })).toBeVisible();
  const networkStatus = page.getByRole('button', { name: 'Regtest network status' });
  await expect(networkStatus).toBeVisible();
  await networkStatus.click();
  const statusPanel = page.locator('.network-popover');
  await expect(statusPanel.getByText('Priority fee')).toBeVisible();
  await expect(statusPanel.getByText(/\d+ sat\/vB/)).toBeVisible();
  await expect(statusPanel.getByText('Unlock to check')).toBeVisible();
  await expect(
    statusPanel.getByText('Node credentials remain sealed until a wallet is unlocked.')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show Wallet passphrase' }).click();
  await expect(page.getByLabel('Wallet passphrase', { exact: true })).toHaveAttribute(
    'type',
    'text'
  );
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await expect(page.getByText('Incorrect passphrase / PIN.')).toBeVisible();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await page.getByLabel('Wallet passphrase', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('protected-storage denial stays locked and permits an explicit unlock retry', async ({
  page
}) => {
  await page.goto('/unlock?fixture-secure-storage-retry=1&fixture-locked-wallet-switch=1');
  const credential = page.getByLabel('Wallet passphrase', { exact: true });
  await credential.fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await expect(page.getByText(/Encrypted wallet storage is unavailable/)).toBeVisible();
  await expect(credential).toBeEditable();
  await expect(credential).toHaveValue('');

  await credential.fill('prototype-passphrase');
  await expect(page.getByText(/Encrypted wallet storage is unavailable/)).toBeHidden();
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('existing wallet can exit add-wallet and cannot reopen the fresh-install chooser', async ({
  page
}) => {
  await page.goto('/welcome?add=1');
  await expect(page.getByRole('button', { name: 'Close wallet setup' })).toBeVisible();
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await chooseSoftwareWallet(page);
  await page.getByRole('button', { name: 'Close wallet setup' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.goto('/welcome');
  await expect(page).toHaveURL(/\/unlock$/);
  await expect(page.locator('.unlock-overlay h1')).toBeVisible();
  await expect(page.locator('.unlock-overlay h1')).not.toHaveText('Welcome back');
  await expect(page.locator('.onboarding-card').getByRole('button', { name: 'Back' })).toHaveCount(
    0
  );
  await expect(page.getByRole('button', { name: 'Create or recover another wallet' })).toHaveCount(
    0
  );
});

test('locked wallet can continue into hardware and multisig setup', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Lock Everyday wallet now/ }).click();
  await expect(page).toHaveURL(/\/unlock$/);

  await page.goto('/welcome?add=1');
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await page.getByRole('link', { name: /Hardware signer/ }).click();
  await expect(page).toHaveURL(/\/hardware\/new$/);
  await expect(page.getByRole('heading', { name: 'Add hardware signer' })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveClass(/onboarding-shell/);

  await page.getByRole('link', { name: /Cancel/ }).click();
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await page.getByRole('link', { name: /Multisig wallet/ }).click();
  await expect(page).toHaveURL(/\/multisig\/new$/);
  await expect(page.getByRole('heading', { name: 'Create a multisig wallet' })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveClass(/onboarding-shell/);
});

test('shows skeletons while a restored wallet loads its first synced data', async ({ page }) => {
  // Start observing after navigation commits rather than after every resource
  // finishes, because the fixture intentionally makes this state transient.
  await page.goto('/?fixture-delayed-wallet-data=1', { waitUntil: 'commit' });
  await expect(page.locator('.wallet-skeleton.balance')).toBeVisible();
  await expect(page.locator('.wallet-skeleton.transactions')).toBeVisible();
  await expect(page.getByText('Hardware order', { exact: true })).toBeVisible();
  await expect(page.locator('.wallet-skeleton')).toHaveCount(0);
});

test('switching wallets never renders data from the previously selected wallet', async ({
  page
}) => {
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  await page.goto('/?fixture-delayed-wallet-switch=1');
  await expect(page.getByText('Hardware order', { exact: true })).toBeVisible();

  if (isMobile) {
    await page.getByRole('button', { name: 'Switch wallet' }).click();
    await page.getByRole('menuitemradio', { name: /Family wallet/ }).click();
  } else {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  }

  await expect(page.locator('.wallet-skeleton.balance')).toBeVisible();
  await expect(page.getByText('Hardware order', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No transactions yet' })).toBeVisible();
  await expect(page.locator('.balance-value')).toContainText('0 sats');
  await expect(page.locator('.wallet-skeleton')).toHaveCount(0);
});

test('switching between locked wallets never renders an intermediate wallet screen', async ({
  page
}) => {
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  test.skip(isMobile, 'The locked mobile shell does not expose wallet switching.');
  await page.goto('/unlock?fixture-locked-wallet-switch=1');
  await expect(page.getByRole('heading', { name: 'Everyday wallet' })).toBeVisible();

  await page.evaluate(() => {
    const renderedHeadings: string[] = [];
    const recordHeadings = () => {
      for (const heading of document.querySelectorAll('h1')) {
        const text = heading.textContent?.trim();
        if (text) renderedHeadings.push(text);
      }
    };
    const observer = new MutationObserver(recordHeadings);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    Object.assign(window, {
      __walletSwitchHeadings: renderedHeadings,
      __walletSwitchObserver: observer
    });
  });

  await page
    .getByRole('complementary')
    .getByRole('button', { name: /Family wallet/ })
    .click();

  await expect(page).toHaveURL(/\/unlock(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  const renderedHeadings = await page.evaluate(() => {
    const runtime = window as typeof window & {
      __walletSwitchHeadings?: string[];
      __walletSwitchObserver?: MutationObserver;
    };
    runtime.__walletSwitchObserver?.disconnect();
    return runtime.__walletSwitchHeadings ?? [];
  });
  expect(renderedHeadings).not.toContain('Overview');
});

test('creates, switches, unlocks, and deletes isolated wallet profiles', async ({ page }) => {
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  await page.goto('/settings');
  if (isMobile) {
    await page
      .locator('.wallet-manager')
      .getByRole('button', { name: /Add wallet/ })
      .click();
  } else {
    await page
      .getByRole('complementary')
      .getByRole('link', { name: /Add wallet/ })
      .click();
  }
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await chooseSoftwareWallet(page);
  await page.getByRole('button', { name: 'Generate 24 recovery words' }).click();
  await page.getByRole('button', { name: /reveal words/i }).click();
  await confirmGeneratedBackup(page);
  await page.getByLabel('Wallet name').fill('Savings wallet');
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('savings-passphrase');
  await page.getByLabel('Confirm wallet passphrase', { exact: true }).fill('savings-passphrase');
  await page.getByLabel(/I understand this exact passphrase/).check();
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  if (isMobile) {
    await page.getByRole('link', { name: 'Settings' }).click();
    const walletManager = page.locator('.wallet-manager');
    await expect(walletManager.getByRole('button', { name: /Savings wallet/ })).toBeVisible();
    await expect(walletManager.getByRole('button', { name: /Everyday wallet/ })).toBeVisible();
    await walletManager.getByRole('button', { name: /Everyday wallet/ }).click();
  } else {
    const walletList = page.getByRole('complementary').getByRole('list', { name: 'Wallets' });
    await expect(
      walletList.getByRole('button', { name: /Savings wallet.*active wallet/ })
    ).toBeVisible();
    await expect(walletList.getByRole('button', { name: /Everyday wallet/ })).toBeVisible();
    await walletList.getByRole('button', { name: /Everyday wallet/ }).click();
  }
  await expect(page).not.toHaveURL(/\/unlock/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  if (isMobile) {
    const walletManager = page.locator('.wallet-manager');
    await expect(walletManager.getByRole('button', { name: /Savings wallet/ })).toBeVisible();
    await expect(walletManager.getByRole('button', { name: /Everyday wallet/ })).toBeVisible();
    await expect(
      walletManager.getByRole('button', { name: /Everyday wallet/ }).locator('svg')
    ).toHaveCount(2);
    await walletManager.getByRole('button', { name: /Savings wallet/ }).click();
  } else {
    const walletList = page.getByRole('complementary').getByRole('list', { name: 'Wallets' });
    await expect(page.locator('.mobile-wallet-manager')).toBeHidden();
    await expect(walletList.getByRole('button', { name: /Savings wallet/ })).toBeVisible();
    await expect(
      walletList.getByRole('button', { name: /Everyday wallet.*active wallet/ })
    ).toBeVisible();
    await walletList.getByRole('button', { name: /Savings wallet/ }).click();
  }
  await expect(page).not.toHaveURL(/\/unlock/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('creates an external-signer wallet, signs by cable, and configures its isolated node', async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.goto('/welcome?add=1');
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await page.getByRole('link', { name: /Hardware signer/ }).click();
  await expect(page.getByRole('heading', { name: 'Add hardware signer' })).toBeVisible();
  await page.getByLabel('Wallet name').fill('Hardware savings');
  await page.getByRole('button', { name: /Connect with cable/ }).click();
  await expect(
    page.getByRole('status', { name: 'Hardware signer setup in progress' })
  ).toContainText('Scanning');
  await expect(
    page.getByRole('status', { name: 'Hardware signer setup in progress' })
  ).toContainText('Follow any unlock prompt on the signer. Keep other wallet apps closed.');
  await page.getByRole('button', { name: /Virtual Coldcard/ }).click();
  await expect(
    page.getByRole('status', { name: 'Hardware signer setup in progress' })
  ).toContainText('Reading the public account key');
  await expect(page.getByText('PUBLIC DATA REVIEW')).toBeVisible();
  await expect(page.getByText("m/84'/1'/0'")).toBeVisible();
  await page.getByRole('button', { name: 'Fingerprint matches' }).click();
  await page.getByLabel('App PIN', { exact: true }).fill('hardware-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('hardware-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Rename hardware signer Hardware savings' }).click();
  const signerNameDialog = page.getByRole('dialog', { name: 'Rename hardware signer' });
  await expect(
    signerNameDialog.getByText(/does not change the device, fingerprint, public keys, descriptors/)
  ).toBeVisible();
  await signerNameDialog.getByLabel('New hardware signer name').fill('Travel signing key');
  await signerNameDialog.getByRole('button', { name: 'Save signer name' }).click();
  await expect(page.getByText('Hardware signer name updated')).toBeVisible();
  await expect(
    page.getByText(/Travel signing key · Used on signing and verification screens/)
  ).toBeVisible();

  await page.getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('link', { name: 'Receive', exact: true }).click();
  await page.getByRole('button', { name: 'New receive address' }).click();
  await page.getByLabel('Label', { exact: true }).fill('Verified deposit');
  await page.getByRole('button', { name: 'Generate address' }).click();
  await expect(
    page.locator('.address-label').getByText('Not verified', { exact: true })
  ).toBeVisible();
  const awaitingDeposit = page
    .locator('.awaiting-addresses')
    .getByRole('button', { name: /View Verified deposit/ });
  await expect(awaitingDeposit.getByText('Hardware not verified', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Verify on device' }).click();
  await expect(
    page.getByRole('status', { name: 'Hardware device scan in progress' })
  ).toContainText('Looking for your saved signer');
  const verificationDialog = page.getByRole('dialog', { name: 'Verify receive address' });
  const addressDetails = verificationDialog.locator('details.verification-details');
  const addressDetailsSummary = addressDetails.locator('summary');
  await expect(addressDetailsSummary.getByText('Address details', { exact: true })).toBeVisible();
  await expect(addressDetailsSummary.locator('svg')).toBeVisible();
  await expect(addressDetails).not.toHaveAttribute('open', '');
  await addressDetailsSummary.click();
  await expect(addressDetails).toHaveAttribute('open', '');
  await addressDetailsSummary.click();
  await expect(addressDetails).not.toHaveAttribute('open', '');
  await expect(
    verificationDialog.getByRole('button', { name: /^Travel signing key / })
  ).toContainText('Ready');
  await expect(
    page.locator('.address-label').getByText('Not verified', { exact: true })
  ).toBeVisible();
  await verificationDialog.getByRole('button', { name: /^Travel signing key / }).click();
  const hardwareApproval = page.getByRole('status', { name: 'Waiting for hardware approval' });
  await expect(hardwareApproval).toContainText('Check your hardware device');
  await expect(hardwareApproval).toContainText('approve it on the device');
  const hardwareVerification = page.getByRole('button', { name: /Verified on hardware/ });
  await expect(hardwareVerification).toBeVisible();
  await expect(awaitingDeposit.getByText('Hardware verified', { exact: true })).toBeVisible();
  await expect(awaitingDeposit.getByText('Hardware not verified', { exact: true })).toHaveCount(0);
  await hardwareVerification.click();
  await expect(page.getByRole('tooltip')).toHaveText(
    'This exact address was shown on and matched by a saved hardware signer. The verification applies only to this address.'
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.getByRole('button', { name: 'Show address details' }).click();
  await expect(
    page.locator('dl.optional-details dt').filter({ hasText: /^Hardware verified$/ })
  ).toBeVisible();
  await expect(page.getByText('Signer fingerprint', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Hardware test payment');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1200');
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByText('Fee rate', { exact: true })).toBeHidden();
  await page.getByText('View more details', { exact: true }).click();
  await expect(page.getByText('Fee rate', { exact: true })).toBeVisible();
  await expect(page.getByText('Transaction inputs', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to sign' }).click();
  await expect(page.getByRole('heading', { name: 'Sign on your hardware' })).toBeVisible();
  await expect(
    page.locator('.send-signers').getByText('Travel signing key', { exact: true })
  ).toBeVisible();
  const psbtDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save unsigned PSBT' }).click();
  await expect((await psbtDownload).suggestedFilename()).toMatch(/^groot-[a-z0-9]{1,8}\.psbt$/);
  await expect(page.getByText('PSBT saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show in Finder' })).toBeVisible();
  await page.getByRole('button', { name: 'Show in Finder' }).click();
  await expect(page.getByText('PSBT saved', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Import signed PSBT' }).click();
  const rejectedImport = page.getByRole('dialog', { name: 'Import signed PSBT' });
  await rejectedImport.getByRole('textbox', { name: 'Signed PSBT' }).fill('fixture-rejected-psbt');
  await rejectedImport.getByRole('button', { name: 'Validate signature' }).click();
  await expect(rejectedImport.getByRole('alert')).toContainText('Signed PSBT rejected');
  await expect(rejectedImport.getByRole('alert')).toContainText(
    'does not match the transaction you reviewed'
  );
  await expect(page.locator('.toast').filter({ hasText: 'Signed PSBT rejected' })).toBeVisible();
  await expect(page.getByText('0 of 1 collected', { exact: true })).toBeVisible();
  await rejectedImport.getByRole('button', { name: 'Cancel' }).click();
  const durableImportError = page.locator('.signing-transport-error');
  await expect(durableImportError).toContainText('Signed PSBT rejected');
  await expect(durableImportError).toContainText('does not match the transaction you reviewed');
  expect(await durableImportError.evaluate((element) => getComputedStyle(element).textAlign)).toBe(
    'left'
  );
  await page.getByRole('button', { name: 'Import signed PSBT' }).click();
  await expect(rejectedImport.getByRole('textbox', { name: 'Signed PSBT' })).toHaveValue('');
  await expect(rejectedImport.getByRole('alert')).toHaveCount(0);
  await rejectedImport.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Show unsigned QR' }).click();
  await expect(durableImportError).toHaveCount(0);
  const unsignedQrDialog = page.getByRole('dialog', { name: 'Unsigned PSBT' });
  const unsignedQrImage = unsignedQrDialog.getByRole('img', { name: /crypto-psbt QR frame/ });
  await expect(unsignedQrImage).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Scan signed QR' }).click();
  await expect(
    page.getByText(
      /Point the camera at a crypto-psbt QR|Camera access was denied|No usable camera is available/
    )
  ).toBeVisible();
  await expect(
    page.getByText('QR scanning is not available in this WebView. Import the PSBT file instead.')
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Sign with cable' }).click();
  await expect(
    page.getByRole('status', { name: 'Hardware device scan in progress' })
  ).toContainText('Looking for hardware devices');
  const hardwareReview = page.getByRole('dialog', { name: 'Sign with hardware' });
  await expect(hardwareReview.getByText('Fee rate', { exact: true })).toBeHidden();
  await hardwareReview.getByText('View more details', { exact: true }).click();
  await expect(hardwareReview.getByText('Fee rate', { exact: true })).toBeVisible();
  await expect(hardwareReview.getByText('Transaction inputs', { exact: true })).toHaveCount(0);
  await hardwareReview.getByRole('button', { name: /^Travel signing key / }).click();
  await expect(page.getByRole('status', { name: 'Waiting for hardware signature' })).toContainText(
    'Review the recipient, amount, fee, and change'
  );
  await expect(page.getByText('Signature verified')).toBeVisible();
  const signedReview = page.getByRole('region', { name: 'Signed transaction review' });
  await expect(signedReview).toBeVisible();
  expect(
    await signedReview
      .locator(':scope > .details-list')
      .evaluate((element) => getComputedStyle(element).borderTopWidth)
  ).toBe('0px');
  expect(
    await signedReview
      .locator('.proposal-review-details')
      .evaluate((element) => getComputedStyle(element).borderBottomWidth)
  ).toBe('0px');
  const signaturePanel = page.locator('.ready-panel').filter({ hasText: 'Signature verified' });
  const signatureTitle = await signaturePanel.locator('strong').boundingBox();
  const signatureDetail = await signaturePanel.locator('small').boundingBox();
  expect(Math.abs((signatureTitle?.x ?? 0) - (signatureDetail?.x ?? 0))).toBeLessThanOrEqual(1);
  const finalizeButton = await page
    .getByRole('button', { name: 'Finalize & broadcast' })
    .boundingBox();
  const backToReviewButton = await page
    .getByRole('button', { name: 'Back to review' })
    .boundingBox();
  expect(backToReviewButton?.height).toBe(finalizeButton?.height);
  expect(
    (backToReviewButton?.y ?? 0) - ((finalizeButton?.y ?? 0) + (finalizeButton?.height ?? 0))
  ).toBeGreaterThanOrEqual(8);
  await page.getByRole('button', { name: 'Cancel payment' }).click();
  const cancelProposalDialog = page.getByRole('dialog', { name: 'Cancel this payment?' });
  await expect(cancelProposalDialog.getByText('1 of 1 collected')).toBeVisible();
  await cancelProposalDialog.getByRole('button', { name: 'Keep payment' }).click();
  await expect(page.getByText('Signature verified')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign with cable' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show unsigned QR' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review signed transaction' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Signed transaction review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign with cable' })).toHaveCount(0);
  await page.getByLabel('App PIN', { exact: true }).fill('hardware-pin');
  await page.getByRole('button', { name: 'Finalize & broadcast' }).click();
  await expect(page.getByRole('heading', { name: 'Payment sent' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /Export public descriptor/ }).click();
  const descriptorDialog = page.getByRole('dialog', { name: 'Export public descriptor' });
  await expect
    .poll(async () => {
      const warningBox = await descriptorDialog.locator('.warning-box').boundingBox();
      const pinLabel = await descriptorDialog.locator('.password-field .field-label').boundingBox();
      return (pinLabel?.y ?? 0) - ((warningBox?.y ?? 0) + (warningBox?.height ?? 0));
    })
    .toBeGreaterThanOrEqual(16);
  await descriptorDialog.getByLabel('App PIN', { exact: true }).fill('wrong-pin');
  await descriptorDialog.getByRole('button', { name: 'Prepare backup' }).click();
  await expect(descriptorDialog.getByRole('alert')).toHaveText('Incorrect app PIN.');
  await descriptorDialog.getByLabel('App PIN', { exact: true }).fill('hardware-pin');
  await descriptorDialog.getByRole('button', { name: 'Prepare backup' }).click();
  await expect(
    descriptorDialog.getByText('Public descriptor ready', { exact: true })
  ).toBeVisible();
  const readyPanel = descriptorDialog.locator('.ready-panel');
  const readyTitle = await readyPanel
    .getByText('Public descriptor ready', { exact: true })
    .boundingBox();
  const readyDetail = await readyPanel
    .getByText(/Import this file in a clean disposable/)
    .boundingBox();
  expect(Math.abs((readyTitle?.x ?? 0) - (readyDetail?.x ?? 0))).toBeLessThanOrEqual(1);
  await descriptorDialog.getByRole('button', { name: 'View descriptor' }).click();
  const identifierDialog = page.getByRole('dialog', { name: 'Public wallet descriptor' });
  await expect(
    identifierDialog.getByRole('button', { name: 'Copy exact Descriptor' })
  ).toBeVisible();
  await identifierDialog.getByRole('button', { name: 'Close' }).click();
  const descriptorDownload = page.waitForEvent('download');
  await descriptorDialog.getByRole('button', { name: 'Save descriptor' }).click();
  await expect((await descriptorDownload).suggestedFilename()).toBe('groot-hardware-wallet.json');
  await expect(page.getByText('Descriptor backup saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /Fee and broadcast node/ }).click();
  await page.getByRole('button', { name: 'Remote TLS' }).click();
  await page.getByLabel('RPC URL').fill('https://regtest-node.example:18443');
  await page.getByLabel('RPC username').fill('groot');
  await page.getByLabel('RPC password', { exact: true }).fill('rpc-secret');
  await page.getByLabel('App PIN', { exact: true }).fill('hardware-pin');
  await page.getByRole('button', { name: 'Save & test' }).click();
  await expect(page.getByText('Trusted remote server')).toBeVisible();
});

test('localizes hardware scan progress in French', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('groot-language', 'fr'));
  await page.goto('/hardware/new');
  await page.getByRole('button', { name: /Connecter par câble/ }).click();
  await expect(
    page.getByRole('status', { name: 'Configuration du signataire matériel en cours' })
  ).toContainText('Recherche de tous les signataires matériels USB…');
});

test('imports a public hardware backup without requiring a wallet name first', async ({ page }) => {
  await page.goto('/hardware/new');
  await expect(page.getByLabel('Wallet name')).toHaveValue('');
  await page.getByLabel('Import public backup file').setInputFiles({
    name: 'groot-hardware-wallet.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        network: 'regtest',
        descriptor: "wpkh([f00dbabe/84'/1'/0']tpub-fixture/<0;1>/*)"
      })
    )
  });
  await expect(page.getByText('PUBLIC DATA REVIEW')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'groot hardware wallet' })).toBeVisible();
  await expect(page.getByText("m/84'/1'/0'")).toBeVisible();
  await expect(page.getByText('Review the public backup identity.')).toBeVisible();
  await expect(
    page.getByText(/verify the first receive address on the hardware signer/)
  ).toBeVisible();
  await page.getByLabel('Reviewed wallet name').fill('Ledger recovery wallet');
  await expect(page.getByRole('heading', { name: 'Ledger recovery wallet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use this public backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fingerprint matches' })).toHaveCount(0);
});

test('unlocks a Trezor before choosing its standard single-key wallet', async ({ page }) => {
  await page.goto('/hardware/new');
  const setupGuides = page.getByRole('button', { name: 'Device setup guides' });
  const setupGuideStyle = await setupGuides.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const previousBounds = element.previousElementSibling?.getBoundingClientRect();
    return {
      fontSize: Number.parseFloat(style.fontSize),
      height: bounds.height,
      gap: previousBounds ? bounds.top - previousBounds.bottom : 0
    };
  });
  expect(setupGuideStyle.fontSize).toBe(10);
  expect(setupGuideStyle.height).toBeGreaterThanOrEqual(38);
  expect(setupGuideStyle.gap).toBeGreaterThanOrEqual(12);
  await setupGuides.click();
  await expect(page.getByRole('dialog', { name: 'Prepare your signer' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Connect with cable' }).click();
  const scan = page.getByRole('dialog', { name: 'Connect hardware signer' });
  expect(await scan.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(
    await scan
      .locator('.hardware-device-list')
      .evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
  await scan.getByRole('button', { name: /Virtual Trezor One/ }).click();

  const pin = page.getByRole('dialog', { name: 'Unlock Trezor' });
  await expect(pin.getByText('Match locations, not numbers')).toBeVisible();
  await expect(
    pin.getByText('For each PIN digit on Trezor, tap the blank cell in the same location.')
  ).toBeVisible();
  await expect(pin.getByRole('button', { name: 'Top left position' })).toHaveText('');
  await pin.getByRole('button', { name: 'Top left position' }).click();
  await pin.getByRole('button', { name: 'Bottom left position' }).click();
  await pin.getByRole('button', { name: 'Top right position' }).click();
  await pin.getByRole('button', { name: 'Unlock Trezor' }).click();

  const rescanned = page.getByRole('dialog', { name: 'Connect hardware signer' });
  const unlocked = rescanned.getByRole('button', { name: /Virtual Trezor One/ });
  await expect(unlocked.getByText('Choose wallet')).toBeVisible();
  await unlocked.click();
  const standard = page.getByRole('dialog', { name: 'Use Trezor standard wallet?' });
  await expect(standard.getByText(/add it to Groot as a separate wallet/)).toBeVisible();
  await standard.getByRole('button', { name: 'Use standard wallet' }).click();

  await expect(page.getByText('PUBLIC DATA REVIEW')).toBeVisible();
  await expect(page.getByText('c0ffee03', { exact: true })).toBeVisible();
});

test('global keyboard shortcuts navigate safely and match the Settings reference', async ({
  page
}) => {
  await page.goto('/');
  const primary = (await page.evaluate(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform)))
    ? 'Meta'
    : 'Control';

  await page.keyboard.press(`${primary}+2`);
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await page.keyboard.press(`${primary}+3`);
  await expect(page.getByRole('heading', { name: 'Coins' })).toBeVisible();
  await page.keyboard.press(`${primary}+4`);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'App appearance' })).toBeVisible();

  const shortcuts = page.locator('.keyboard-shortcut-grid');
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.locator('dt')).toHaveText([
    'Overview',
    'Activity',
    'Coins',
    'Settings',
    'Receive',
    'Send'
  ]);

  await page.keyboard.press(`${primary}+Shift+R`);
  await expect(page).toHaveURL(/\/receive$/);
  await page.keyboard.press(`${primary}+Shift+S`);
  await expect(page).toHaveURL(/\/send$/);

  const labelInput = page.getByRole('textbox', { name: 'Payment label' });
  await labelInput.focus();
  await page.keyboard.press(`${primary}+2`);
  await expect(page).toHaveURL(/\/send$/);
  await expect(labelInput).toBeFocused();
});

test('overview, activity, UTXOs, and settings expose durable states', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  const overviewMore = page.getByRole('button', { name: 'More wallet actions' });
  const actionHeight = (await overviewMore.boundingBox())?.height;
  const referenceAction =
    (page.viewportSize()?.width ?? 1180) > 760
      ? page.locator('.primary-actions .overview-inline-primary').first()
      : page.locator('.mobile-actions .mobile-action').first();
  expect(actionHeight).toBe((await referenceAction.boundingBox())?.height);
  await overviewMore.click();
  const overviewMenu = page.getByRole('menu', { name: 'More wallet actions' });
  await expect(overviewMenu.getByRole('menuitem')).toHaveCount(2);
  await expect(
    overviewMenu.getByRole('menuitem', { name: /Show descriptors|Export & verify|Policy/ })
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  const overviewTransaction = page.locator('.tx-row').first();
  await expect(overviewTransaction).toBeVisible();
  await expect(overviewTransaction.getByRole('list', { name: 'Assigned labels' })).toBeVisible();
  await overviewTransaction.click();
  await expect(page.getByRole('heading', { name: 'Transaction details' })).toBeVisible();
  await expect(page.locator('.modal-layer')).not.toHaveAttribute('style', /opacity/);
  await expect(page.locator('.modal-layer')).toHaveCSS('opacity', '1');
  const overviewDetails = page.getByRole('dialog', { name: 'Transaction details' });
  await expect(
    overviewDetails.getByRole('list', { name: 'Assigned labels' }).first()
  ).toBeVisible();
  await expect(overviewDetails.getByText('Transaction ID', { exact: true })).toBeHidden();
  await expect(overviewDetails.getByText('Inputs', { exact: true })).toBeHidden();
  await overviewDetails.getByText('View more details', { exact: true }).click();
  await expect(overviewDetails.getByText('Transaction ID', { exact: true })).toBeVisible();
  await expect(overviewDetails.getByText('Inputs', { exact: true })).toBeVisible();
  await expect(overviewDetails.getByText('Outputs', { exact: true })).toBeVisible();
  await expect(overviewDetails.getByText('Locktime / RBF', { exact: true })).toBeVisible();
  const technicalDetailValues = (
    await overviewDetails.locator('.transaction-more-details dd').allTextContents()
  ).join('\n');
  expect(technicalDetailValues).not.toMatch(/\S·|·\S/);
  await expect(
    page.getByText('mempool.space cannot see local regtest transactions.')
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /View on mempool\.space/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByPlaceholder('Search labels')).toBeVisible();
  const activitySort = page.locator('.activity-controls select');
  await activitySort.selectOption('oldest');
  await expect(activitySort).toHaveValue('oldest');
  await activitySort.selectOption('newest');
  await expect(page.locator('.tx-row.pending').getByText('Awaiting confirmation')).toBeVisible();
  await page.getByRole('button', { name: 'Received' }).click();
  const confirmedReceivedTransaction = page.locator('.tx-row:not(.pending)').first();
  await expect(confirmedReceivedTransaction).toBeVisible();
  await confirmedReceivedTransaction.click();
  const transactionDialog = page.getByRole('dialog', { name: 'Transaction details' });
  await expect(transactionDialog).toBeVisible();
  await expect(
    transactionDialog.getByRole('list', { name: 'Assigned labels' }).first()
  ).toBeVisible();
  await expect(page.getByText('Confirmations', { exact: true })).toBeVisible();
  const transactionTime = transactionDialog.locator('time');
  await expect(transactionTime).not.toContainText('local time');
  await expect(transactionTime).toHaveAttribute('title', /Local time:.*UTC:/);
  await page.waitForTimeout(220);
  const compactBox = await transactionDialog.boundingBox();
  await transactionDialog.locator('.compact-address-button').click();
  await expect(
    transactionDialog.getByRole('button', { name: 'Show compact address' })
  ).toBeVisible();
  const expandedBox = await transactionDialog.boundingBox();
  expect(compactBox).not.toBeNull();
  expect(expandedBox).not.toBeNull();
  const compactCenter = compactBox!.y + compactBox!.height / 2;
  const expandedCenter = expandedBox!.y + expandedBox!.height / 2;
  if ((page.viewportSize()?.width ?? 1180) <= 760) {
    const compactBottom = compactBox!.y + compactBox!.height;
    const expandedBottom = expandedBox!.y + expandedBox!.height;
    expect(expandedBottom).toBeCloseTo(compactBottom, 0);
  } else {
    expect(expandedCenter).toBeCloseTo(compactCenter, 0);
  }
  await transactionDialog.getByRole('button', { name: 'Show compact address' }).click();
  const collapsedTop = (await transactionDialog.boundingBox())?.y;
  expect(collapsedTop).toBeCloseTo(compactBox!.y, 0);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: 'Coins' }).click();
  await expect(page.getByRole('heading', { name: 'Coins' })).toBeVisible();
  const reusedCoin = page.locator('.coin-row').filter({ hasText: 'Address reused' }).first();
  await expect(reusedCoin.getByText(/Address reused/)).toBeVisible();
  await expect(reusedCoin.getByText('Outpoint', { exact: true })).toHaveCount(0);
  await reusedCoin.getByRole('button', { name: 'Show details' }).click();
  await reusedCoin.getByText('Privacy & history', { exact: true }).click();
  await expect(
    reusedCoin.getByText(/This coin shares its address with \d+ other coin/)
  ).toBeVisible();
  await expect(reusedCoin.getByText('Linked coin', { exact: true })).toBeVisible();
  await reusedCoin.getByText('Technical details', { exact: true }).click();
  await expect(reusedCoin.getByText('Outpoint', { exact: true })).toBeVisible();
  const changeCoin = page.locator('.coin-row').filter({ hasText: 'Mixed provenance' });
  const inheritedLabels = changeCoin.getByRole('list', { name: 'Assigned labels' });
  await expect(inheritedLabels.getByRole('listitem', { name: 'Savings' })).toBeVisible();
  await expect(inheritedLabels.getByRole('listitem', { name: 'Refund' })).toBeVisible();
  await changeCoin.getByRole('button', { name: 'Show details for Savings, Refund' }).click();
  await changeCoin.getByText('Privacy & history', { exact: true }).click();
  await expect(changeCoin.locator('dt').filter({ hasText: 'Source payment intent' })).toBeVisible();
  await expect(changeCoin.getByText('Hardware order', { exact: true })).toBeVisible();
  await expect(changeCoin.locator('dt').filter({ hasText: 'Change lineage' })).toBeVisible();
  await changeCoin.getByText('Technical details', { exact: true }).click();
  await expect(changeCoin.getByText('Source transaction', { exact: true })).toBeVisible();
  await expect(changeCoin.getByText('2 wallet inputs', { exact: true })).toBeVisible();
  await changeCoin.getByRole('button', { name: 'About source payment intent' }).hover();
  await expect(changeCoin.getByRole('tooltip')).toContainText(
    'The label of the payment that created this change.'
  );
  await changeCoin.getByRole('button', { name: 'About change lineage' }).hover();
  await expect(changeCoin.getByRole('tooltip')).toContainText(
    'How many wallet inputs were combined'
  );
  const filterHeights = await page.locator('.coin-filters').evaluate((filters) => {
    const input = filters.querySelector('input');
    const select = filters.querySelector('select');
    return {
      input: input?.getBoundingClientRect().height ?? 0,
      select: select?.getBoundingClientRect().height ?? 0
    };
  });
  expect(filterHeights.input).toBe(filterHeights.select);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('Delete wallet', { exact: true })).toBeVisible();
});

test('amount denomination stays consistent across wallet surfaces', async ({ page }) => {
  await page.goto('/settings');
  const amountDisplay = page.getByLabel('Amount display');
  await amountDisplay.getByRole('button', { name: 'BTC' }).click();
  await expect(amountDisplay.getByRole('button', { name: 'BTC' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.goto('/');
  const balanceToggle = page.getByRole('button', { name: 'Show balance in sats' });
  await expect(balanceToggle).toContainText('0.02481240 BTC');
  await balanceToggle.press('Enter');
  await expect(page.getByRole('button', { name: 'Show balance in BTC' })).toContainText(
    '2,481,240 sats'
  );
  await page.getByRole('button', { name: 'Show balance in BTC' }).click();
  await expect(page.getByRole('button', { name: 'Show balance in sats' })).toContainText(
    '0.02481240 BTC'
  );
  await page.goto('/coins');
  await expect(page.locator('.stat-pill .formatted-amount')).toContainText('0.02481240 BTC');
  const bitcoinParts = page.locator('.stat-pill .formatted-amount');
  expect(
    await bitcoinParts.evaluate((amount) => {
      const strong = amount.querySelector<HTMLElement>('strong');
      return Boolean(strong && strong.textContent === '0.02481240' && strong.children.length === 0);
    })
  ).toBe(true);
  await page.reload();
  await expect(page.locator('.stat-pill .formatted-amount')).toContainText('0.02481240 BTC');

  await page.goto('/send');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Uniform BTC amount');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('0.00008000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  const reviewedAmount = page.locator('.review-amount .formatted-amount');
  await expect(reviewedAmount).toContainText('0.00008000 BTC');
  expect(
    await reviewedAmount.evaluate((amount) => {
      const strong = amount.querySelector<HTMLElement>('strong');
      return Boolean(strong && strong.textContent === '0.00008000' && strong.children.length === 0);
    })
  ).toBe(true);
});

test('translates settings, connection feedback, and route copy', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'FR', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Apparence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Détails du portefeuille' })).toBeVisible();
  await expect(page.getByText('Thème', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clair', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sombre', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Tester la connexion/ }).click();
  await expect(page.getByText('Nœud Bitcoin connecté')).toBeVisible();
  await expect(page.getByText(/blocs · historique complet des blocs/)).toBeVisible();

  await page.getByRole('button', { name: 'ES', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detalles de la cartera' })).toBeVisible();
  await expect(page.getByText('Tema', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claro', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Oscuro', exact: true })).toBeVisible();

  await page.goto('/send');
  await expect(page.getByRole('heading', { name: 'Enviar bitcoin' })).toBeVisible();
  await expect(page.getByLabel('Etiqueta del pago')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar al importe' })).toBeVisible();
});

test('renames the selected wallet from settings without changing its identity', async ({
  page
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Rename Everyday wallet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename wallet' });
  await expect(
    dialog.getByText(/does not change descriptors, signer identity, recovery data/)
  ).toBeVisible();
  await dialog.getByLabel('New wallet name').fill('Daily spending');
  await dialog.getByRole('button', { name: 'Save name' }).click();

  await expect(page.getByRole('heading', { name: 'Daily spending' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename Daily spending' })).toBeVisible();
  await expect(page.getByText('Wallet name updated')).toBeVisible();
  if ((page.viewportSize()?.width ?? 1180) > 760) {
    await expect(
      page.getByRole('complementary').getByText('Daily spending', { exact: true })
    ).toBeVisible();
  }
});

test('pending incoming transaction opens CPFP review without offering sender-side RBF', async ({
  page
}) => {
  await page.goto('/activity');
  await page.locator('.tx-row').filter({ hasText: 'Invoice #104' }).click();
  await expect(page.getByRole('link', { name: 'Increase fee (RBF)' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Spend output (CPFP)' }).click();
  await expect(page).toHaveURL(/accelerate=cpfp/);
  await expect(page.getByText('Fee rate', { exact: true })).toBeHidden();
  await page.getByText('View more details', { exact: true }).click();
  await expect(page.getByText('Fee rate', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to sign' })).toBeVisible();
});

test('CPFP success identifies the fee-only child instead of a zero-sat payment', async ({
  page
}) => {
  await page.goto('/activity');
  await page.locator('.tx-row').filter({ hasText: 'Invoice #104' }).click();
  await page.getByRole('link', { name: 'Spend output (CPFP)' }).click();
  await page.getByRole('button', { name: 'Continue to sign' }).click();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();

  await expect(page.getByRole('heading', { name: 'Fee acceleration broadcast' })).toBeVisible();
  await expect(page.locator('.success-state')).toContainText(
    /fee-only child transaction with a .* sats network fee was broadcast/
  );
  await expect(page.getByText('0 sats was broadcast to the Bitcoin network.')).toHaveCount(0);
});

test('confirmed outgoing and pending incoming transactions do not offer sender-side RBF', async ({
  page
}) => {
  await page.goto('/activity');
  await page.locator('.tx-row').filter({ hasText: 'Hardware order' }).click();
  await expect(page.getByRole('link', { name: 'Increase fee (RBF)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('.tx-row').filter({ hasText: 'Invoice #104' }).click();
  await expect(page.getByRole('link', { name: 'Increase fee (RBF)' })).toHaveCount(0);
});

test('recovery scan and private network controls preserve explicit safety choices', async ({
  page
}) => {
  await page.goto('/settings?fixture-hold-first-recovery-scan=1');
  await page.getByRole('button', { name: /Recovery scan/ }).click();
  const recoveryScan = page.getByRole('dialog', { name: 'Full wallet rescan' });
  await page.getByLabel('Wallet birthday block').fill('0');
  await page.getByLabel('Address gap limit').fill('19');
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await expect(recoveryScan.getByRole('button', { name: 'Save & rescan' })).toBeDisabled();
  await page.getByLabel('Address gap limit').fill('50');
  await Promise.all([
    recoveryScan.getByRole('button', { name: 'Cancel scan' }).click(),
    recoveryScan.getByRole('button', { name: 'Save & rescan' }).click()
  ]);
  await expect(
    recoveryScan.getByRole('progressbar', { name: 'Recovery scan progress' })
  ).toBeVisible();
  await expect(recoveryScan.getByText('Scan cancelled', { exact: true })).toBeVisible();
  await expect(recoveryScan.getByText(/Saved progress remains safe/)).toBeVisible();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await recoveryScan.getByRole('button', { name: 'Save & rescan' }).click();
  await expect(page.getByRole('button', { name: /Recovery scan.*gap limit 50/ })).toBeVisible();

  await page.getByRole('button', { name: /Wallet activity sync/ }).click();
  const syncSource = page.getByRole('dialog', { name: 'Wallet activity sync' });
  await syncSource.getByRole('button', { name: 'Compact filters' }).click();
  await expect(syncSource.getByText('Confirmed activity only.')).toBeVisible();
  await syncSource.getByLabel('Peer selection').selectOption({ label: 'Manual peers only' });
  await expect(
    syncSource.getByText('Manual mode never falls back to DNS seeds or public peers.')
  ).toBeVisible();
  await syncSource
    .getByLabel('Manual peers · one numeric IP:port per line')
    .fill('127.0.0.1:18444');
  await syncSource.getByLabel('Optional local Tor SOCKS5 proxy').fill('127.0.0.1:9050');
  await syncSource.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await syncSource.getByRole('button', { name: 'Save source' }).click();
  await expect(
    page.getByRole('button', {
      name: /Wallet activity sync.*P2P compact filters.*confirmed activity only/
    })
  ).toBeVisible();

  await page.getByRole('button', { name: /Fee and broadcast node/ }).click();
  await page.getByRole('button', { name: 'Tor onion' }).click();
  await expect(page.getByLabel('Local SOCKS5 proxy')).toHaveValue('127.0.0.1:9050');
  await page.getByLabel('RPC URL').fill('http://groottestnode.onion:8332');
  await page.getByLabel('RPC username').fill('groot');
  await page.getByLabel('RPC password', { exact: true }).fill('rpc-secret');
  const coreDialog = page.getByRole('dialog', { name: 'Connect Bitcoin Core' });
  await coreDialog.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await coreDialog.getByRole('button', { name: 'Save & test' }).click();
  await expect(page.getByText(/Trusted remote server/)).toBeVisible();
});

test('activity explains its empty state', async ({ page }) => {
  await page.goto('/activity?fixture-empty-activity=1');
  await expect(page.getByRole('heading', { name: 'No transactions yet' })).toBeVisible();
  await expect(page.getByText('Payments you send and receive will appear here.')).toBeVisible();
});

test('overview and coins resolve empty wallets without lingering skeletons', async ({ page }) => {
  await page.goto('/?fixture-empty-wallet=1');
  await expect(page.getByRole('heading', { name: 'No transactions yet' })).toBeVisible();
  await expect(page.getByText('Received and sent transactions will appear here.')).toBeVisible();
  await expect(page.locator('.wallet-skeleton')).toHaveCount(0);

  await page.goto('/coins?fixture-empty-wallet=1');
  await expect(page.getByRole('heading', { name: 'No coins yet' })).toBeVisible();
  await expect(
    page.getByText('Received bitcoin will appear here after this wallet has synchronized.')
  ).toBeVisible();
  await expect(page.locator('.wallet-skeleton')).toHaveCount(0);
  const toolbar = await page.locator('.coin-toolbar').boundingBox();
  const empty = await page.locator('.empty-state').boundingBox();
  expect(toolbar && empty).toBeTruthy();
  expect(empty!.y - (toolbar!.y + toolbar!.height)).toBeGreaterThanOrEqual(13);
});

test('receive label suggestions expose aligned tooltips for every label', async ({ page }) => {
  await page.goto('/receive');
  await page.getByRole('button', { name: 'New receive address' }).click();
  const suggestion = page.getByRole('button', { name: 'Reuse Savings' });
  await suggestion.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText('Savings');
  const suggestionBox = await suggestion.boundingBox();
  const tooltipBox = await tooltip.boundingBox();
  expect(suggestionBox && tooltipBox).toBeTruthy();
  expect(suggestionBox!.y - (tooltipBox!.y + tooltipBox!.height)).toBeCloseTo(8, 0);
});

test('receive keeps multiple labeled payment requests and discards them independently', async ({
  page
}) => {
  await page.goto('/receive');
  await page.getByRole('button', { name: 'View details for Invoice #104' }).click();
  const addressDetails = page.getByRole('dialog', { name: 'Invoice #104' });
  await expect(addressDetails.getByLabel('Assigned labels').first()).toContainText('Invoice #104');
  await expect(addressDetails.getByText('Payment received')).toBeVisible();
  await expect(addressDetails.getByText("m/84'/1'/0'/0/7", { exact: true })).toBeVisible();
  await expect(addressDetails.getByRole('button', { name: 'Copy exact address' })).toBeVisible();
  await addressDetails.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New receive address' }).click();
  await expect(page.getByText('Previously used labels')).toHaveCount(0);
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue('');
  await expect(page.locator('.label-suggestions')).toBeVisible();
  expect(await page.locator('.label-suggestions button').count()).toBeLessThanOrEqual(4);
  const stableDialogHeight = (await page.getByRole('dialog').boundingBox())?.height;
  await page.getByLabel('Label', { exact: true }).fill('A label that does not exist');
  await expect(page.locator('.label-suggestions button')).toHaveCount(0);
  expect((await page.getByRole('dialog').boundingBox())?.height).toBeCloseTo(
    stableDialogHeight!,
    2
  );
  await page.getByLabel('Label', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Reuse Savings' }).click();
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove Savings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reuse Savings' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.getByRole('button', { name: 'Remove Savings' }).click();
  await expect(page.getByRole('button', { name: 'Reuse Savings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate address' })).toBeDisabled();
  await page.getByLabel('Label', { exact: true }).fill('Invoice #205');
  await page.getByLabel('Label', { exact: true }).press(',');
  await expect(page.getByRole('button', { name: 'Remove Invoice #205' })).toBeVisible();
  await page.getByLabel('Label', { exact: true }).press('Backspace');
  await expect(page.locator('.label-token-armed')).toHaveText('Invoice #205');
  await expect(page.getByRole('button', { name: 'Remove Invoice #205' })).toBeVisible();
  await page.getByLabel('Label', { exact: true }).press('Backspace');
  await expect(page.getByRole('button', { name: 'Remove Invoice #205' })).toHaveCount(0);
  await page.getByLabel('Label', { exact: true }).fill('Invoice #205,Customer A,Q3;');
  await page.getByLabel('Label', { exact: true }).fill('A deliberately long reusable label;');
  await page.getByRole('button', { name: 'Generate address' }).click();
  const currentAddressLabels = page.locator('.receive-card').getByLabel('Assigned labels');
  await expect(currentAddressLabels).toContainText('Invoice #205');
  await expect(currentAddressLabels).toContainText('Customer A');
  await expect(currentAddressLabels).toContainText('Q3');
  await expect(currentAddressLabels).toContainText('A deliberately long reusable label');
  await page.getByRole('button', { name: 'New receive address' }).click();
  await expect(page.getByRole('button', { name: 'Reuse Invoice #205' })).toBeVisible();
  const longSuggestion = page.getByRole('button', {
    name: 'Reuse A deliberately long reusable label'
  });
  await longSuggestion.hover();
  await expect(page.getByRole('tooltip')).toHaveText('A deliberately long reusable label');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('img', { name: /QR code for/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enlarge QR code' }).click();
  const qrDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('img', { name: /Large QR code/ }) });
  await expect(qrDialog.getByRole('img', { name: /Large QR code/ })).toBeVisible();
  await expect(qrDialog.getByRole('button', { name: 'Copy exact address' })).toBeVisible();
  await expect(
    qrDialog.getByText('Spaces are visual only. Copy always uses the exact address.')
  ).toBeVisible();
  const visualGroups = qrDialog.locator('.readable-address-groups > span');
  await expect(visualGroups).toHaveCount(12);
  expect((await visualGroups.allTextContents()).join('')).toBe(
    'bcrt1qdummy00095n8k2r7v4cx9s6jlawephgzuqf5t8ul'
  );
  await expect(visualGroups.first()).toHaveClass(/edge/);
  await expect(visualGroups.last()).toHaveClass(/edge/);
  await qrDialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Show address details' }).click();
  await expect(page.getByLabel('Assigned labels').first()).toContainText('Invoice #205');
  await expect(page.getByText("m/84'/1'/0'/0/9")).toBeVisible();
  await page.getByRole('button', { name: 'New receive address' }).click();
  await page.getByLabel('Label', { exact: true }).fill('Invoice #206');
  await page.getByRole('button', { name: 'Generate address' }).click();
  await expect(page.getByText('3 active addresses')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Invoice #205' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Invoice #206' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard Invoice #205' }).click();
  await page.getByRole('button', { name: 'Discard address' }).click();
  await expect(page.getByRole('button', { name: 'View Invoice #205' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'View Invoice #206' })).toBeVisible();
  await expect(page.getByText('2 active addresses')).toBeVisible();
});

test('single-key receive and send cap manual label drafts at five', async ({ page }) => {
  await page.goto('/receive');
  await page.getByRole('button', { name: 'New receive address' }).click();
  await page.getByLabel('Label', { exact: true }).fill('R1,R2,R3,R4,R5,R6;');
  await expect(page.locator('.label-token')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Remove R6' })).toHaveCount(0);
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue('');
  await expect(page.locator('.label-suggestions button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove R5' }).click();
  await page.getByLabel('Label', { exact: true }).fill('R6');
  await page.getByLabel('Label', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove R6' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/send');
  await page.getByLabel('Payment label').fill('S1;S2;S3;S4;S5;S6;');
  await expect(page.locator('.label-token')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Remove S6' })).toHaveCount(0);
  await expect(page.getByLabel('Payment label')).toHaveValue('');
  await expect(page.locator('.label-suggestions button')).toHaveCount(0);
});

test('coin control selects, freezes, and carries coins into send', async ({ page }) => {
  await page.goto('/coins');
  const first = page.getByRole('checkbox', { name: 'Select Savings', exact: true });
  await first.check();
  await expect(page.getByText('1 selected')).toBeVisible();
  await expect(page.locator('.coin-toolbar')).toContainText('1,250,000 sats selected');
  await page.getByRole('button', { name: 'More actions for selected coin' }).click();
  await page.getByRole('menuitem', { name: /Freeze selected/ }).click();
  const freezeDialog = page.getByRole('dialog', { name: 'Freeze Savings?' });
  await expect(
    freezeDialog.getByText(
      'Frozen coins are excluded from automatic and manual spending until you unfreeze them.'
    )
  ).toBeVisible();
  await freezeDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Frozen', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'More actions for selected coin' }).click();
  await page.getByRole('menuitem', { name: /Freeze selected/ }).click();
  await page
    .getByRole('dialog', { name: 'Freeze Savings?' })
    .getByRole('button', { name: 'Freeze coin' })
    .click();
  await expect(page.getByText('Frozen', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Unfreeze Savings' }).click();
  const unfreezeDialog = page.getByRole('dialog', { name: 'Unfreeze Savings?' });
  await expect(unfreezeDialog.getByText('Unfreezing does not spend this coin.')).toBeVisible();
  await unfreezeDialog.getByRole('button', { name: 'Unfreeze coin' }).click();
  await first.check();
  await page.getByRole('checkbox', { name: 'Select Savings, Refund', exact: true }).check();
  await page.getByRole('link', { name: 'Send selected coins' }).click();
  await expect(page).toHaveURL(/\/send\?coins=/);
  await page.getByLabel('Payment label').fill('Coin selection test');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await expect(page.getByText('Manual · 2 coins')).toBeVisible();
  const selectionPreview = page.locator('.manual-selection-preview');
  await expect(selectionPreview).toContainText('2 selected · 1,639,090 sats');
  await expect(selectionPreview.locator('.selection-technical > span')).toBeHidden();
  await expect(selectionPreview.getByText('Funding labels', { exact: true })).toBeVisible();
  await selectionPreview.getByText('Input details', { exact: true }).click();
  await expect(selectionPreview).toContainText('Estimated input weight: 1,000 WU');
  const coinMode = page.getByRole('button', { name: /Manual · 2 coins/ });
  await coinMode.click();
  await expect(
    page.locator('.send-coin-picker').getByText('Savings', { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.locator('.send-coin-picker label').first().getByRole('listitem', { name: 'Savings' })
  ).toBeVisible();
  await coinMode.click();
  await selectionPreview.getByRole('button', { name: 'Use privacy-first selection' }).click();
  await expect(
    page.locator('.coin-mode').getByText('Automatic selection', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.coin-mode')).toContainText('More private');
  await page.getByRole('button', { name: 'Max' }).click();
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('2480253');
});

test('discreet mode hides coin labels and amounts without leaking them through controls', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide wallet amounts' }).first().click();
  await page.getByRole('link', { name: 'Coins' }).click();
  const coinPage = page.locator('.page');
  await expect(coinPage).toContainText('Labels hidden');
  await expect(coinPage).not.toContainText('Savings');
  await expect(coinPage).not.toContainText('1,250,000');
  await expect(
    page.getByRole('checkbox', { name: 'Select Coin with hidden labels', exact: true }).first()
  ).toBeVisible();
  await expect(page.getByPlaceholder('Filter labels')).toBeDisabled();

  await page.goto('/send');
  await expect(page.getByLabel('Payment label')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reuse Savings' })).toHaveCount(0);

  await page.goto('/receive');
  await page.getByRole('button', { name: 'New receive address' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Reuse Savings' })).toHaveCount(
    0
  );
});

test('send reviews a proposal and rejects a wrong credential', async ({ page }) => {
  await page.goto('/send');
  const paymentProgress = page.getByRole('navigation', { name: 'Payment progress' });
  await expect(paymentProgress).toContainText('Intent');
  await expect(paymentProgress).toContainText('Amount & fee');
  await expect(paymentProgress).toContainText('Review & sign');
  await expect(page.getByRole('region', { name: 'Payment signers' })).toContainText('Groot app');
  await expect(page.getByText('Previously used labels')).toHaveCount(0);
  await expect(page.getByLabel('Payment label')).toHaveValue('');
  await expect(page.locator('.label-suggestions')).toBeVisible();
  await page.getByRole('button', { name: 'Reuse Savings' }).click();
  await expect(page.getByLabel('Payment label')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove Savings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reuse Savings' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Test payment');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await expect(paymentProgress.getByText('Amount & fee')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Payment label')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove Savings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Test payment' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('25000');
  await page.getByRole('button', { name: /Automatic selection/ }).click();
  await page.getByRole('button', { name: /Lower fee/ }).click();
  await page.getByRole('button', { name: 'Review payment' }).click();
  const reviewLabels = page.locator('.details-list').first().getByLabel('Assigned labels');
  await expect(reviewLabels).toContainText('Savings');
  await expect(reviewLabels).toContainText('Test payment');
  await expect(page.getByText('25,000')).toBeVisible();
  await expect(page.getByText('Exact strategy comparison')).toBeVisible();
  await expect(
    page.locator('.selection-review').filter({ hasText: 'Exact strategy comparison' })
  ).toContainText('100 sats lower than the valid More private candidate');
  await page.getByRole('button', { name: 'Continue to sign' }).click();
  const authorizationReview = page.getByRole('region', {
    name: 'Transaction authorization review'
  });
  await expect(authorizationReview).toBeVisible();
  await expect(authorizationReview).toContainText('Test payment');
  await expect(authorizationReview).toContainText('25,000');
  await expect(authorizationReview).toContainText('Network fee');
  await expect(authorizationReview).toContainText('Total');
  await expect(authorizationReview.getByText('Fee rate', { exact: true })).toBeHidden();
  await authorizationReview.getByText('View more details', { exact: true }).click();
  await expect(authorizationReview.getByText('Fee rate', { exact: true })).toBeVisible();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();
  await expect(page.getByText('Incorrect passphrase / PIN.')).toBeVisible();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment sent' })).toBeVisible();
  await expect(page.getByText('Transaction ID')).toBeVisible();
});

test('software payment resumes through the shared draft callout and cancellation warning', async ({
  page
}) => {
  await page.goto('/send');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Saved software payment');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('8000');
  await page.getByRole('button', { name: 'Review payment' }).click();

  await page.getByRole('link', { name: 'Overview' }).click();
  const resume = page.getByRole('link', {
    name: 'Resume payment, Saved software payment, 0 of 1 signatures collected'
  });
  await expect(resume).toContainText('Payment ready to sign');
  await expect(resume).toContainText('0 of 1 signatures collected');
  await resume.click();

  await expect(
    page.locator('.form-card').getByText('Saved software payment', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('8,000', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel payment' }).click();
  const cancellation = page.getByRole('dialog', { name: 'Cancel this payment?' });
  await expect(cancellation.getByText('This cannot be undone.')).toBeVisible();
  await expect(cancellation.getByText('0 of 1 collected')).toBeVisible();
  await cancellation.getByRole('button', { name: 'Keep payment' }).click();
  await expect(
    page.locator('.form-card').getByText('Saved software payment', { exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Continue to sign' }).click();
  await page.getByRole('button', { name: 'Cancel payment' }).click();
  await cancellation.getByRole('button', { name: 'Cancel payment' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Resume payment/ })).toHaveCount(0);
});

test('an address copied from Receive completes the browser send flow', async ({ page }) => {
  await page.goto('/receive');
  const receiveAddress = await page.locator('.receive-card .address-box code').innerText();
  await page.goto('/send');
  await page.getByLabel('Bitcoin address').fill(receiveAddress);
  await page.getByLabel('Payment label').fill('Self transfer test');
  await expect(page.getByText(/Enter a valid .* address/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('25000');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: 'Continue to sign' }).click();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment sent' })).toBeVisible();
  await expect(page.getByText('Remaining wallet balance: 2,455,253 sats')).toBeVisible();
});

test('custom fees validate and wallet deletion requires typed confirmation', async ({ page }) => {
  await page.goto('/send');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Coin control test');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  const feeEstimate = page.getByText(/Estimated fee .*Bitcoin Core/);
  await expect(feeEstimate).toBeVisible();
  await expect(page.getByText('estimatesmartfee')).toHaveCount(0);
  await page.getByRole('button', { name: /Custom/ }).click();
  await page.getByLabel('Custom fee rate').fill('0');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeDisabled();
  await page.getByLabel('Custom fee rate').fill('3.5');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(page.getByRole('button', { name: 'Delete wallet' })).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  await expect(page.getByText('Enter this wallet’s app PIN to continue.')).toBeVisible();
});

test('fee estimate failure never invents a send rate and preserves the custom path', async ({
  page
}) => {
  await page.goto('/send?fixture-fee-estimates-unavailable=1');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Explicit fee test');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1000');

  await expect(page.getByRole('alert')).toContainText('Bitcoin Core has no usable fee estimate');
  for (const preset of ['Economy', 'Standard', 'Priority']) {
    const button = page.getByRole('button', { name: new RegExp(`^${preset}`) });
    await expect(button).toBeDisabled();
    await expect(button).toContainText('Unavailable');
  }
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeDisabled();
  await page.getByLabel('Custom fee rate').fill('4.25');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByText('Explicit fee test', { exact: true })).toBeVisible();
});

test('fee estimate failure preserves explicit CPFP acceleration', async ({ page }) => {
  await page.goto('/activity?fixture-fee-estimates-unavailable=1');
  await page.locator('.tx-row').filter({ hasText: 'Invoice #104' }).click();
  await page.getByRole('link', { name: 'Spend output (CPFP)' }).click();
  await expect(page.getByRole('heading', { name: 'Enter a custom fee rate' })).toBeVisible();
  await expect(page.getByText(/will not invent one/)).toBeVisible();
  const review = page.getByRole('button', { name: 'Review acceleration' });
  await expect(review).toBeDisabled();
  await page.getByLabel('Custom acceleration fee rate').fill('15');
  await expect(review).toBeEnabled();
  await review.click();
  await expect(page.getByRole('button', { name: 'Continue to sign' })).toBeVisible();
});

test('locked regtest wallet reset requires exact typed confirmation', async ({ page }) => {
  await page.goto('/unlock?fixture-locked-wallet-switch=1');
  await page.getByRole('button', { name: 'Delete this regtest wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Delete this regtest wallet?' })).toBeVisible();
  const reset = page.getByRole('button', { name: 'Delete test wallet' });
  await expect(reset).toBeDisabled();
  await page.getByLabel('Type RESET REGTEST to confirm').fill('reset regtest');
  await expect(reset).toBeDisabled();
  await page.getByLabel('Type RESET REGTEST to confirm').fill('RESET REGTEST');
  await reset.click();
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1180) > 760) {
    await expect(
      page.getByRole('complementary').getByRole('button', { name: /Family wallet.*active wallet/ })
    ).toBeVisible();
  } else {
    await expect(page.getByText('Enter this wallet’s app PIN to continue.')).toBeVisible();
  }
});

test('locked profiles use recovery-safe credential terms', async ({ page }) => {
  await page.goto('/unlock?fixture-locked-wallet-switch=1');
  await expect(page.getByLabel('Wallet passphrase', { exact: true })).toBeVisible();
  const infoButton = page.getByRole('button', { name: 'More information' });
  await page.getByRole('button', { name: 'Use light mode' }).click();
  await infoButton.hover();
  const lightTooltip = page.getByRole('tooltip');
  await expect(lightTooltip).toBeVisible();
  expect(
    await lightTooltip.evaluate((tooltip) => {
      const probe = document.createElement('span');
      probe.style.background = 'var(--panel-2)';
      document.body.append(probe);
      const matches =
        getComputedStyle(tooltip).backgroundColor === getComputedStyle(probe).backgroundColor;
      probe.remove();
      return matches;
    })
  ).toBe(true);
  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await infoButton.hover();
  const darkTooltip = page.getByRole('tooltip');
  await expect(darkTooltip).toBeVisible();
  expect(
    await darkTooltip.evaluate((tooltip) => {
      const probe = document.createElement('span');
      probe.style.background = 'var(--panel-2)';
      document.body.append(probe);
      const matches =
        getComputedStyle(tooltip).backgroundColor === getComputedStyle(probe).backgroundColor;
      probe.remove();
      return matches;
    })
  ).toBe(true);
  await expect(
    page.getByText(/BIP39 passphrase is required with your 24 recovery words/)
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 1180) > 760) {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Family wallet/ })
      .click();
    await expect(page.getByLabel('App PIN', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'More information' }).click();
    await expect(page.getByText(/not a hardware-signer passphrase/)).toBeVisible();
    await expect(
      page.locator('.onboarding-card').getByRole('button', { name: /Everyday wallet/ })
    ).toHaveCount(0);
  }
});

test('recovery words remain readable in light and dark themes', async ({ page }) => {
  for (const theme of ['Light', 'Dark']) {
    await page.goto('/settings');
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.goto('/welcome?fixture-empty=1');
    await page.getByRole('button', { name: 'Add wallet' }).click();
    await chooseSoftwareWallet(page);
    await page.getByRole('button', { name: 'Generate 24 recovery words' }).click();
    await page.getByRole('button', { name: /reveal words/i }).click();
    await expect(page.locator('.mnemonic-grid > div')).toHaveCount(24);
    const ratios = await page.evaluate(() => {
      const rgb = (value: string) => {
        if (value.startsWith('color(')) {
          return value
            .replace(/^color\([^ ]+\s+/, '')
            .replace(/\).*$/, '')
            .split(/\s+/)
            .slice(0, 3)
            .map(Number)
            .map((channel) => channel * 255);
        }
        return (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      };
      const luminance = (value: number[]) => {
        const channels = value
          .map((channel) => channel / 255)
          .map((channel) =>
            channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          );
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground: string, background: string) => {
        const [lighter, darker] = [luminance(rgb(foreground)), luminance(rgb(background))].sort(
          (a, b) => b - a
        );
        return (lighter + 0.05) / (darker + 0.05);
      };
      return [...document.querySelectorAll('.mnemonic-grid > div')].flatMap((cell) => {
        const background = getComputedStyle(cell).backgroundColor;
        return [
          contrast(getComputedStyle(cell.querySelector('strong')!).color, background),
          contrast(getComputedStyle(cell.querySelector('span')!).color, background)
        ];
      });
    });
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
  }
});

test('light and dark theme tokens keep readable text contrast', async ({ page }) => {
  await page.goto('/settings');
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const rgb = (name: string) => {
        const value = style.getPropertyValue(name).trim();
        const hex = value.slice(1);
        return [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((channel) =>
          Number(`0x${channel}`)
        );
      };
      const luminance = (value: number[]) => {
        const channels = value
          .map((channel) => channel / 255)
          .map((channel) =>
            channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          );
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground: number[], background: number[]) => {
        const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
          (a, b) => b - a
        );
        return (lighter + 0.05) / (darker + 0.05);
      };
      const background = rgb('--bg');
      return {
        text: contrast(rgb('--text'), background),
        muted: contrast(rgb('--muted'), background),
        mutedSecondary: contrast(rgb('--muted-2'), background)
      };
    });
    expect(ratios.text).toBeGreaterThanOrEqual(7);
    expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
    expect(ratios.mutedSecondary).toBeGreaterThanOrEqual(4.5);

    await page.goto('/unlock?fixture-locked-wallet-switch=1');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await expect(page.locator('.unlock-overlay h1')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Wallet passphrase' })).toBeVisible();
    const unlockRatios = await page.evaluate(() => {
      const rgb = (value: string) => {
        if (value.startsWith('color(')) {
          return value
            .replace(/^color\([^ ]+\s+/, '')
            .replace(/\).*$/, '')
            .split(/\s+/)
            .slice(0, 3)
            .map(Number)
            .map((channel) => channel * 255);
        }
        return (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      };
      const luminance = (value: number[]) => {
        const channels = value
          .map((channel) => channel / 255)
          .map((channel) =>
            channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          );
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground: string, background: string) => {
        const [lighter, darker] = [luminance(rgb(foreground)), luminance(rgb(background))].sort(
          (a, b) => b - a
        );
        return (lighter + 0.05) / (darker + 0.05);
      };
      const ratio = (foregroundSelector: string, backgroundSelector: string, pseudo?: string) => {
        const foreground = document.querySelector(foregroundSelector)!;
        let background = document.querySelector(backgroundSelector) as Element | null;
        let backgroundColor = 'rgb(0, 0, 0)';
        while (background) {
          const candidate = getComputedStyle(background).backgroundColor;
          if (
            candidate !== 'transparent' &&
            !candidate.endsWith(', 0)') &&
            !candidate.endsWith(', 0.0)')
          ) {
            backgroundColor = candidate;
            break;
          }
          background = background.parentElement;
        }
        return contrast(getComputedStyle(foreground, pseudo).color, backgroundColor);
      };
      return {
        heading: ratio('.onboarding-card h1', '.onboarding-card'),
        copy: ratio('.onboarding-card > p', '.onboarding-card'),
        label: ratio('.onboarding-card .field > span', '.onboarding-card'),
        input: ratio('.onboarding-card input', '.onboarding-card input'),
        placeholder: ratio('.onboarding-card input', '.onboarding-card input', '::placeholder'),
        disabledAction: ratio('.onboarding-card .button', '.onboarding-card .button'),
        footer: ratio('.onboarding-footer', '.onboarding-overlay')
      };
    });
    for (const [surface, ratio] of Object.entries(unlockRatios)) {
      expect(ratio, `${theme} unlock ${surface} contrast`).toBeGreaterThanOrEqual(4.5);
    }
    await page.goto('/settings');
  }
});
