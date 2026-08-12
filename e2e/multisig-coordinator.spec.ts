import { expect, test, type Page } from '@playwright/test';

const keys = [
  { label: 'Coldcard', fingerprint: 'a1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-1' },
  { label: 'Ledger', fingerprint: 'b1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-2' },
  { label: 'Trezor', fingerprint: 'c1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-3' }
];
const recoveryKey = { label: 'Recovery key', fingerprint: 'd1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-4' };

async function continueToSigners(page: Page, name: string) {
  await page.getByLabel('Wallet name').fill(name);
  await page.getByRole('button', { name: 'Continue to signers' }).click();
}

async function saveSetupDescriptor(page: Page, expectedFilename: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save public descriptor text|Save another copy/ }).click();
  await expect((await download).suggestedFilename()).toBe(expectedFilename);
  await expect(page.getByText('Descriptor backup saved', { exact: true })).toBeVisible();
}

test('routes receive address creation through the selected wallet kind', async ({ page }) => {
  await page.goto('/multisig/receive');
  await expect(page).toHaveURL(/\/receive$/);
  await expect(page.getByRole('heading', { name: 'Receive bitcoin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New receive address' })).toBeVisible();
});

test('multisig acceleration requires an explicit rate when estimates are unavailable', async ({ page }) => {
  await page.goto('/multisig/send?fixture-fee-estimates-unavailable=1&accelerate=rbf&txid=6a1b2c3d4e5f67890123456789abcdef6a1b2c3d4e5f67890123456789abcdef');

  await expect(page.getByRole('heading', { name: 'Enter a custom fee rate' })).toBeVisible();
  await expect(page.getByText(/will not invent one/)).toBeVisible();
  const review = page.getByRole('button', { name: 'Review acceleration' });
  await expect(review).toBeDisabled();
  await page.getByLabel('Custom acceleration fee rate').fill('18');
  await expect(review).toBeEnabled();
  await review.click();
  const transactionReview = page.getByRole('region', { name: 'Transaction review' });
  await expect(transactionReview).toBeVisible();
  await expect(page.getByRole('region', { name: 'Payment signers' })).toContainText('2 of 3');
});

test('spends end-to-end from the ready-made demo wallet', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => { copied = value; },
        readText: async () => copied
      }
    });
  });
  await page.goto('/multisig');
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  await expect(page.getByText('Ready-to-test demo wallet')).toBeVisible();
  await expect(page.getByText('2,481,240 sats')).toBeVisible();
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  const paymentProgress = page.getByRole('navigation', { name: 'Payment progress' });
  await expect(paymentProgress).toContainText('Intent');
  await expect(paymentProgress).toContainText('Amount & fee');
  await expect(paymentProgress).toContainText('Review & sign');
  const signerSummary = page.getByRole('region', { name: 'Payment signers' });
  await expect(signerSummary).toContainText('2 of 3');
  await expect(signerSummary).toContainText('Coldcard');
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Bitcoin address').press('Enter');
  await expect(page.getByRole('button', { name: 'Continue to amount' })).toBeDisabled();
  await page.getByLabel('Payment label').fill('   ');
  await page.getByLabel('Payment label').press('Enter');
  await expect(page.getByRole('button', { name: 'Continue to amount' })).toBeDisabled();
  await page.getByLabel('Payment label').fill('Test purchase');
  await page.getByLabel('Payment label').press('Enter');
  await page.getByLabel('Amount', { exact: true }).fill('50000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByText('Test purchase', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 more signatures required' })).toBeDisabled();
  await expect(page.getByText('Fee rate', { exact: true })).toBeHidden();
  await page.getByText('View more details', { exact: true }).click();
  await expect(page.getByText('Fee rate', { exact: true })).toBeVisible();
  await expect(page.getByText('Transaction inputs', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View complete recipient address' }).click();
  const addressDialog = page.getByRole('dialog', { name: 'Recipient address' });
  await expect(addressDialog.getByRole('button', { name: 'Copy exact address' })).toBeVisible();
  await expect(addressDialog.getByText('Spaces are visual only. Copy always uses the exact address.', { exact: true })).toBeVisible();
  await addressDialog.getByRole('button', { name: 'Close' }).click();
  const psbtDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PSBT' }).click();
  const downloadedPsbt = await psbtDownload;
  await expect(downloadedPsbt.suggestedFilename()).toMatch(/^groot-[a-z0-9]{1,8}\.psbt$/);
  const savedChunks: Buffer[] = [];
  for await (const chunk of await downloadedPsbt.createReadStream()) savedChunks.push(Buffer.from(chunk));
  const savedPsbt = Buffer.concat(savedChunks).toString('utf8');
  expect(Buffer.byteLength(savedPsbt)).toBeGreaterThan(0);
  expect(Buffer.byteLength(savedPsbt)).toBeLessThanOrEqual(256 * 1024);
  await page.getByRole('button', { name: 'Copy PSBT' }).click();
  const copiedPsbt = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedPsbt).toBe(savedPsbt);
  await expect(page.getByText('PSBT saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show in Finder' })).toBeVisible();
  await page.getByRole('button', { name: 'Show in Finder' }).click();
  await expect(page.getByText('PSBT saved', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show unsigned QR' }).click();
  const unsignedQrDialog = page.getByRole('dialog', { name: 'Unsigned PSBT' });
  const unsignedQrImage = unsignedQrDialog.getByRole('img', { name: /crypto-psbt QR frame/ });
  await expect(unsignedQrImage).toBeVisible();
  await expect(unsignedQrDialog.getByText(/Frame \d+ of (?:[2-9]|\d{2,})/)).toBeVisible();
  const frameCount = Number((await unsignedQrImage.getAttribute('alt'))?.match(/of (\d+)/i)?.[1] ?? 0);
  const observedFrames = new Set<string>();
  const animationDeadline = Date.now() + Math.max(5_000, frameCount * 500);
  while (observedFrames.size < 2 && Date.now() < animationDeadline) {
    observedFrames.add((await unsignedQrImage.getAttribute('alt')) ?? '');
    await page.waitForTimeout(100);
  }
  expect(frameCount).toBeGreaterThanOrEqual(2);
  expect(observedFrames.size).toBeGreaterThanOrEqual(2);
  await unsignedQrDialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  const hardwareDialog = page.getByRole('dialog', { name: 'Sign with hardware' });
  await expect(hardwareDialog.getByText('Fee rate', { exact: true })).toBeHidden();
  await hardwareDialog.getByText('View more details', { exact: true }).click();
  await expect(hardwareDialog.getByText('Fee rate', { exact: true })).toBeVisible();
  await expect(hardwareDialog.getByText('Transaction inputs', { exact: true })).toHaveCount(0);
  await hardwareDialog.getByRole('button', { name: /Virtual Ledger outsider/ }).click();
  await expect(hardwareDialog.getByText('The connected device does not match any saved signer for this wallet.')).toBeVisible();
  await expect(hardwareDialog.getByRole('button', { name: 'Rescan', exact: true })).toBeVisible();
  await hardwareDialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  await hardwareDialog.getByRole('button', { name: /Virtual Trezor One/ }).click();
  const pinDialog = page.getByRole('dialog', { name: 'Unlock Trezor' });
  await expect(pinDialog.getByText('Match locations, not numbers')).toBeVisible();
  await pinDialog.getByRole('button', { name: 'Top left position' }).click();
  await pinDialog.getByRole('button', { name: 'Bottom center position' }).click();
  await expect(pinDialog.getByLabel('2 PIN positions selected')).toBeVisible();
  await pinDialog.getByRole('button', { name: 'Unlock Trezor' }).click();
  await expect(hardwareDialog).toBeVisible();
  await expect(hardwareDialog.getByRole('button', { name: /Virtual Trezor One/ })).toContainText('c0ffee03');
  await page.getByRole('button', { name: /Virtual Coldcard/ }).click();
  await expect(signerSummary.getByText('1 of 2 collected')).toBeVisible();
  await expect(page.getByRole('button', { name: '1 more signature required' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  const signedColdcard = page.getByRole('button', { name: /Virtual Coldcard/ });
  await expect(signedColdcard).toContainText('Already signed');
  await expect(signedColdcard).toBeDisabled();
  await expect(signerSummary.getByText('1 of 2 collected')).toBeVisible();
  await page.getByRole('button', { name: /Virtual Trezor cosigner/ }).click();
  await expect(signerSummary.getByText('2 of 2 collected')).toBeVisible();
  await expect(page.getByRole('button', { name: /more signatures? required/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finalize & broadcast' })).toBeVisible();
  const saveSignedPsbt = page.getByRole('button', { name: 'Save signed PSBT' });
  await expect(saveSignedPsbt).toBeVisible();
  await expect.poll(async () => {
    const saveButton = await saveSignedPsbt.boundingBox();
    const pinLabel = await page.locator('.password-field .field-label').boundingBox();
    return (pinLabel?.y ?? 0) - ((saveButton?.y ?? 0) + (saveButton?.height ?? 0));
  }).toBeGreaterThanOrEqual(16);
  await expect(page.getByRole('region', { name: 'Signed transaction review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign with device' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show unsigned QR' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to overview' }).click();
  const leaveDialog = page.getByRole('dialog', { name: 'Leave signing?' });
  await expect(leaveDialog.getByText('Your proposal will stay saved.')).toBeVisible();
  await expect(leaveDialog.getByText('2 of 2 collected', { exact: true })).toBeVisible();
  await leaveDialog.getByRole('button', { name: 'Keep signing' }).click();
  await expect(page).toHaveURL(/\/multisig\/send$/);
  await expect(signerSummary.getByText('2 of 2 collected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel payment' }).filter({ visible: true }).click();
  const cancelDialog = page.getByRole('dialog', { name: 'Cancel this payment?' });
  await expect(cancelDialog.getByText('This cannot be undone.')).toBeVisible();
  await expect(cancelDialog.getByText('Test purchase', { exact: true })).toBeVisible();
  await expect(cancelDialog.getByText('2 of 2 collected', { exact: true })).toBeVisible();
  await cancelDialog.getByRole('button', { name: 'Keep payment' }).click();
  await expect(signerSummary.getByText('2 of 2 collected', { exact: true })).toBeVisible();
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Finalize & broadcast' }).click();
  await expect(page.getByRole('heading', { name: 'Transaction broadcast' })).toBeVisible();
  await expect(page.getByText('Remaining wallet balance: 2,429,700 sats')).toBeVisible();
  await expect(page.locator('.toast').filter({ hasText: 'Transaction broadcast' })).toHaveCount(1);
  await expect(page.getByText('Vault transaction broadcast')).toHaveCount(0);
});

test('requires explicit confirmation before discarding a multisig proposal', async ({ page }) => {
  await page.goto('/multisig');
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Payment label').fill('Cancel confirmation test');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('25000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  const cancellationSigners = page.getByRole('region', { name: 'Payment signers' });
  await page.getByRole('button', { name: 'Sign with device' }).click();
  await page.getByRole('button', { name: /Virtual Coldcard/ }).click();
  await expect(cancellationSigners.getByText('1 of 2 collected', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel payment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this payment?' });
  await expect(dialog.getByText('Cancel confirmation test', { exact: true })).toBeVisible();
  await expect(dialog.getByText('25,000 sats', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 of 2 collected', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep payment' }).click();
  await expect(dialog).toBeHidden();
  await expect(cancellationSigners.getByText('1 of 2 collected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel payment' }).first().click();
  await dialog.getByRole('button', { name: 'Cancel payment' }).click();

  await expect(page.getByText('Payment canceled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to amount' })).toBeVisible();
  await page.goto('/multisig');
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  await expect(page.getByText('2,481,240 sats')).toBeVisible();
});

test('keeps advanced wallet actions compact and makes both descriptors inspectable', async ({ page }) => {
  await page.goto('/multisig');
  await page.getByRole('button', { name: 'More wallet actions' }).click();
  await expect(page.getByRole('menuitem', { name: /Show descriptors/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Export & verify/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Show descriptors/ }).click();
  const descriptors = page.getByRole('dialog', { name: 'Wallet descriptors' });
  await expect(descriptors.getByText('Portable wallet descriptor', { exact: true })).toBeVisible();
  await expect(descriptors.getByText('/<0;1>/*', { exact: false })).toBeVisible();
  await descriptors.getByText('View separate receive and change descriptors').click();
  await expect(descriptors.getByText('Receive descriptor', { exact: true })).toBeVisible();
  await expect(descriptors.getByText('Change descriptor', { exact: true })).toBeVisible();
  await expect(descriptors.getByRole('button', { name: 'Copy receive descriptor' })).toBeVisible();
  await expect(descriptors.getByRole('button', { name: 'Copy change descriptor' })).toBeVisible();
  await descriptors.getByRole('button', { name: 'Close' }).click();
});

test('shows cosigner details and runs honest health checks', async ({ page }) => {
  await page.goto('/multisig');

  await expect(page.locator('.saved-cosigner-list article')).toHaveCount(3);
  await expect(page.locator('.signer-readiness-list')).toHaveCount(0);

  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  const coldcardDialog = page.getByRole('dialog', { name: 'Coldcard' });
  await expect(coldcardDialog).toBeVisible();
  await expect(coldcardDialog.getByText('f00dbabe', { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText("m/48'/1'/0'/2'", { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText('Wallet policy', { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText('Policy imported', { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText(/Last verified/)).toBeVisible();
  await expect(coldcardDialog.getByRole('button', { name: 'Review setup' })).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'View public account key (xpub)' }).click();
  const xpubDialog = page.getByRole('dialog', { name: 'Coldcard public account key (xpub)' });
  await expect(xpubDialog.getByRole('button', { name: 'Copy exact Public account key (xpub)' })).toBeVisible();
  await xpubDialog.getByRole('button', { name: 'Close' }).click();
  await expect(coldcardDialog.getByText('Not checked in this session')).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'Run health check' }).click();
  await expect(coldcardDialog.getByRole('status', { name: 'Signer health check in progress' })).toContainText('Checking signer identity');
  await expect(coldcardDialog.locator('.health-card').getByText('Connected identity matches f00dbabe.')).toBeVisible();
  await expect(coldcardDialog.getByText(/Last checked/)).toBeVisible();
  await expect(coldcardDialog.getByText('Recent checks')).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'View Offline backup details' }).click();
  const backupDialog = page.getByRole('dialog', { name: 'Offline backup' });
  await backupDialog.getByRole('button', { name: 'Run health check' }).click();
  await expect(backupDialog.locator('.health-card').getByText(/Physical presence cannot be checked for an offline key/)).toBeVisible();
  await backupDialog.getByRole('button', { name: 'Close' }).click();

  await page.goto('/');
  await page.goto('/multisig');
  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  await expect(page.getByRole('dialog', { name: 'Coldcard' }).getByText('Not checked in this session')).toBeVisible();
});

test('uses the same wallet navigation for a multisig policy', async ({ page }) => {
  await page.goto('/multisig');
  const navigation = (page.viewportSize()?.width ?? 1180) <= 760 ? page.locator('.mobile-nav') : page.getByRole('complementary');
  await expect(navigation.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Activity' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Coins' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Policy', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('2,481,240')).toBeVisible();
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  const moreActions = page.getByRole('button', { name: 'More wallet actions' });
  await expect(moreActions).toBeVisible();
  if (isMobile) {
    const mobileActions = page.locator('.mobile-actions');
    await expect(mobileActions.getByRole('link', { name: 'Receive' })).toBeVisible();
    await expect(mobileActions.getByRole('link', { name: 'Send' })).toBeVisible();
    await expect(page.locator('.overview-inline-primary').first()).toBeHidden();
    const walletTrigger = page.getByRole('button', { name: 'Switch wallet' });
    await walletTrigger.click();
    const walletMenu = page.getByRole('menu', { name: 'Wallets' });
    const [walletTriggerBox, walletMenuBox] = await Promise.all([walletTrigger.boundingBox(), walletMenu.boundingBox()]);
    expect(walletTriggerBox).not.toBeNull();
    expect(walletMenuBox).not.toBeNull();
    expect((walletMenuBox?.y ?? 0) - ((walletTriggerBox?.y ?? 0) + (walletTriggerBox?.height ?? 0))).toBeGreaterThanOrEqual(7);
    expect((walletMenuBox?.y ?? 0) - ((walletTriggerBox?.y ?? 0) + (walletTriggerBox?.height ?? 0))).toBeLessThanOrEqual(9);
    expect(Math.abs((walletMenuBox?.x ?? 0) - (walletTriggerBox?.x ?? 0))).toBeLessThanOrEqual(1);
    await walletTrigger.click();
  } else {
    const receive = page.locator('.primary-actions .overview-inline-primary').filter({ hasText: 'Receive' });
    const send = page.locator('.primary-actions .overview-inline-primary').filter({ hasText: 'Send' });
    await expect(receive).toBeVisible();
    await expect(send).toBeVisible();
    const [moreBox, receiveBox, sendBox] = await Promise.all([
      moreActions.boundingBox(),
      receive.boundingBox(),
      send.boundingBox()
    ]);
    expect(moreBox).not.toBeNull();
    expect(receiveBox).not.toBeNull();
    expect(sendBox).not.toBeNull();
    expect(Math.abs((moreBox?.y ?? 0) - (receiveBox?.y ?? 0))).toBeLessThan(2);
    expect(Math.abs((receiveBox?.y ?? 0) - (sendBox?.y ?? 0))).toBeLessThan(2);
    expect(Math.abs((moreBox?.height ?? 0) - (receiveBox?.height ?? 0))).toBeLessThan(2);
    expect(Math.abs((receiveBox?.height ?? 0) - (sendBox?.height ?? 0))).toBeLessThan(2);
    expect(moreBox?.x ?? 0).toBeLessThan(receiveBox?.x ?? 0);
    expect(receiveBox?.x ?? 0).toBeLessThan(sendBox?.x ?? 0);
  }
  await moreActions.click();
  const moreMenu = page.getByRole('menu', { name: 'More wallet actions' });
  await expect(moreMenu).toBeVisible();
  if (isMobile) {
    await page.waitForTimeout(180);
    const [moreTriggerBox, moreMenuBox] = await Promise.all([moreActions.boundingBox(), moreMenu.boundingBox()]);
    expect(moreTriggerBox).not.toBeNull();
    expect(moreMenuBox).not.toBeNull();
    expect((moreMenuBox?.y ?? 0) - ((moreTriggerBox?.y ?? 0) + (moreTriggerBox?.height ?? 0))).toBeGreaterThanOrEqual(7);
    expect((moreMenuBox?.y ?? 0) - ((moreTriggerBox?.y ?? 0) + (moreTriggerBox?.height ?? 0))).toBeLessThanOrEqual(9);
    expect(Math.abs(((moreMenuBox?.x ?? 0) + (moreMenuBox?.width ?? 0)) - ((moreTriggerBox?.x ?? 0) + (moreTriggerBox?.width ?? 0)))).toBeLessThanOrEqual(1);
  }
  await page.locator('.balance-card').click({ position: { x: 20, y: 20 } });
  await expect(moreMenu).toBeHidden();
  await moreActions.click();
  await page.keyboard.press('Escape');
  await expect(moreMenu).toBeHidden();
  await expect(moreActions).toBeFocused();
  await navigation.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await navigation.getByRole('link', { name: 'Coins' }).click();
  await expect(page.getByRole('heading', { name: 'Coins' })).toBeVisible();
});

test('selects and freezes multisig coins before entering the send flow', async ({ page }) => {
  await page.goto('/');
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  if (isMobile) {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.locator('.wallet-manager').getByRole('button', { name: /Family wallet/ }).click();
  } else {
    await page.getByRole('complementary').getByRole('button', { name: /Family wallet/ }).click();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await page.getByRole('link', { name: 'Coins' }).click();

  const coin = page.getByRole('checkbox', { name: 'Select Savings', exact: true });
  await coin.check();
  await expect(page.getByText('1,250,000 sats selected')).toBeVisible();
  await page.getByRole('button', { name: 'Freeze selected' }).click();
  await page.getByRole('dialog', { name: 'Freeze Savings?' }).getByRole('button', { name: 'Freeze coin' }).click();
  await expect(page.getByRole('button', { name: 'Unfreeze Savings' })).toBeVisible();
  await page.getByRole('button', { name: 'Unfreeze Savings' }).click();
  await page.getByRole('dialog', { name: 'Unfreeze Savings?' }).getByRole('button', { name: 'Unfreeze coin' }).click();
  await coin.check();
  await page.getByRole('link', { name: 'Send selected coins' }).click();
  await expect(page).toHaveURL(/\/multisig\/send\?coins=/);
  await page.getByLabel('Payment label').fill('Vault coin selection');
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await expect(page.getByText('Manual · 1 coin')).toBeVisible();
  await page.getByRole('button', { name: /Manual · 1 coin/ }).click();
  await page.getByRole('button', { name: 'Use automatic selection' }).click();
  await expect(page.locator('.coin-mode').getByText('Automatic selection', { exact: true })).toBeVisible();
});

test('offers safe recipes and advanced M-of-N control', async ({ page }) => {
  await page.goto('/multisig/new');
  await expect(page.getByText('2 of 3', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /3 of 5/ }).click();
  await expect(page.locator('.policy-pill')).toHaveText('3 of 5');
  await page.getByRole('button', { name: /Custom/ }).click();
  await page.getByLabel('Total signers').selectOption('4');
  await page.getByLabel('Signatures required').selectOption('3');
  await expect(page.locator('.policy-pill')).toHaveText('3 of 4');
  await expect(page.getByLabel('Signatures required').locator('option[value="1"]')).toHaveCount(0);
  await expect(page.getByText(/1-of-N wallet has no multisig theft protection/)).toBeVisible();
  await continueToSigners(page, 'Advanced policy vault');
  await expect(page.getByText('Advanced policy vault · 3 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Back to policy' }).click();
  await expect(page.getByLabel('Wallet name')).toHaveValue('Advanced policy vault');
  await expect(page.getByLabel('Total signers')).toHaveValue('4');
  await expect(page.getByLabel('Signatures required')).toHaveValue('3');
});

test('explains hardware readiness before scanning', async ({ page }) => {
  await page.goto('/multisig/new');
  await expect(page.getByRole('button', { name: 'Hardware setup help' })).toHaveCount(0);
  await continueToSigners(page, 'Hardware help vault');
  await page.getByRole('button', { name: 'Hardware setup help' }).click();
  const help = page.getByRole('dialog', { name: 'Prepare your hardware signer' });
  await expect(help).toBeVisible();
  await expect(help.getByText(/seed and private keys never leave the device/)).toBeVisible();
  await help.getByRole('button', { name: 'Ledger' }).click();
  await expect(help.getByText(/open Bitcoin Test/)).toBeVisible();
  await help.getByRole('button', { name: 'BitBox02' }).click();
  await expect(help.getByText(/confirm the same pairing code on both screens/)).toBeVisible();
  await expect(help.getByText(/quit BitBoxApp completely/)).toBeVisible();
  await help.getByRole('button', { name: 'Trezor' }).click();
  await expect(help.getByText(/quit Trezor Suite completely/)).toBeVisible();
  await expect(help.getByText(/locked Model One is expected/)).toBeVisible();
  await expect(help.getByText(/Never enter a seed into Groot/)).toBeVisible();
  await help.getByRole('button', { name: 'Scan for devices' }).click();
  const scan = page.getByRole('dialog', { name: 'Connect hardware device' });
  await expect(scan.getByText('Unlock the signer, then release its USB connection')).toBeVisible();
  await expect(scan.getByText(/open the wallet in BitBoxApp first/)).toBeVisible();
  await expect(scan.getByText(/locked Trezor Model One is supported/)).toBeVisible();
  expect(await scan.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await scan.locator('.hardware-device-list').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(scan.getByRole('button', { name: /Scan again/ })).toBeVisible();
  const modalBody = scan.locator('.modal-body');
  expect(await modalBody.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  const modalCanScroll = await modalBody.evaluate((element) => element.scrollHeight > element.clientHeight);
  if (modalCanScroll) {
    await modalBody.evaluate((element) => element.scrollBy({ top: 480 }));
    expect(await modalBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
  await scan.getByRole('button', { name: 'Close' }).click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('unlocks a detected Trezor with the bounded PIN-position flow', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Trezor PIN vault');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Connect hardware device' }).click();
  const scan = page.getByRole('dialog', { name: 'Connect hardware device' });
  await expect(scan.getByText('Virtual Trezor One')).toBeVisible();
  await expect(scan.getByText('Unlock', { exact: true })).toBeVisible();
  await scan.getByRole('button', { name: /Virtual Trezor One/ }).click();

  const pin = page.getByRole('dialog', { name: 'Unlock Trezor' });
  await expect(pin.getByText(/receives positions, never your PIN digits/)).toBeVisible();
  await expect(pin.getByText(/grid deliberately stays blank/)).toBeVisible();
  await expect(pin.getByRole('button', { name: 'Top left position' })).toHaveText('');
  await pin.getByRole('button', { name: 'Top left position' }).click();
  await pin.getByRole('button', { name: 'Bottom left position' }).click();
  await pin.getByRole('button', { name: 'Top right position' }).click();
  await expect(pin.getByLabel('3 PIN positions selected')).toHaveText('•••');
  await pin.getByRole('button', { name: 'Unlock Trezor' }).click();
  await expect(pin.getByRole('status', { name: 'Trezor unlock in progress' })).toContainText('Waiting for Trezor');
  await expect(page.getByText('Hardware wallet unlocked')).toBeVisible();
  const rescanned = page.getByRole('dialog', { name: 'Connect hardware device' });
  await expect(rescanned).toBeVisible();
  const unlocked = rescanned.getByRole('button', { name: /Virtual Trezor One/ });
  await expect(unlocked.getByText('Choose wallet')).toBeVisible();
  await unlocked.click();
  const standard = page.getByRole('dialog', { name: 'Use Trezor standard wallet?' });
  await standard.getByRole('button', { name: 'Use standard wallet' }).click();
  await expect(page.getByRole('button', { name: 'View Virtual Trezor One details' })).toBeVisible();
  await expect(page.getByText('c0ffee03', { exact: true })).toBeVisible();
});

test('explicitly selects a Trezor standard wallet without changing hidden wallets', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Trezor standard vault');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Connect hardware device' }).click();
  const scan = page.getByRole('dialog', { name: 'Connect hardware device' });
  const standard = scan.getByRole('button', { name: /Virtual Trezor Standard/ });
  await expect(standard.getByText('Choose wallet')).toBeVisible();
  await standard.click();

  const choice = page.getByRole('dialog', { name: 'Use Trezor standard wallet?' });
  await expect(choice.getByText(/does not disable, change, or reveal any hidden passphrase wallet/)).toBeVisible();
  await choice.getByRole('button', { name: 'Use standard wallet' }).click();
  await expect(choice.getByRole('status', { name: 'Hardware signer import in progress' })).toContainText('Importing the Trezor standard wallet');
  await expect(page.getByRole('button', { name: 'View Virtual Trezor Standard details' })).toBeVisible();
  await expect(page.getByText('c0ffee02')).toBeVisible();
});

test('imports a bounded public cosigner record from a mounted-file flow', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Offline import vault');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByLabel('Public signer file').setInputFiles({
    name: 'offline-signer.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: 1,
      label: 'SD signer',
      fingerprint: 'a1b2c3d4',
      accountXpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-from-sd',
      derivationPath: "m/48'/1'/0'/2'"
    }))
  });
  await expect(page.getByText('Public signer imported')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View SD signer details' })).toBeVisible();
  await page.getByRole('button', { name: 'View SD signer details' }).click();
  await expect(page.getByRole('dialog', { name: 'SD signer' }).getByRole('definition').filter({ hasText: 'File import' })).toBeVisible();
});

test('opens and checks an imported hardware cosigner during setup', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Coldcard policy vault');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Connect hardware device' }).click();
  const scan = page.getByRole('dialog', { name: 'Connect hardware device' });
  await scan.getByRole('button', { name: /Virtual Coldcard/ }).click();
  const signerCard = page.getByRole('button', { name: 'View Virtual Coldcard details' });
  const cardRow = signerCard.locator('..');
  await expect(signerCard).toHaveCSS('appearance', 'none');
  await signerCard.hover();
  await expect(cardRow).toHaveCSS('box-shadow', /rgb\(36, 89, 169\)/);
  const rowBounds = await cardRow.boundingBox();
  const detailsBounds = await signerCard.boundingBox();
  const removeBounds = await page.getByRole('button', { name: 'Remove Virtual Coldcard' }).boundingBox();
  expect(rowBounds && detailsBounds && removeBounds).toBeTruthy();
  expect(rowBounds!.x + rowBounds!.width).toBeGreaterThan(detailsBounds!.x + detailsBounds!.width);
  expect(removeBounds!.x + removeBounds!.width).toBeLessThanOrEqual(rowBounds!.x + rowBounds!.width);
  await signerCard.click();
  const details = page.getByRole('dialog', { name: 'Virtual Coldcard' });
  await expect(details.getByText('Not checked in this session')).toBeVisible();
  await details.getByRole('button', { name: 'Run health check' }).click();
  await expect(details.locator('.health-card').getByText('Connected identity matches f00dbabe.')).toBeVisible();
  await expect(details.getByText(/Last checked/)).toBeVisible();
  await details.getByRole('button', { name: 'Close' }).click();
  for (const key of keys.slice(1)) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Signer label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  await expect(page.getByRole('link', { name: 'Recover from backup' })).toHaveCount(0);
  await saveSetupDescriptor(page, 'coldcard-policy-vault-descriptors.txt');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show in Finder' }).click();
  await expect(page.getByRole('button', { name: 'Show in Finder' })).toHaveCount(0);
  await expect(page.getByText('Register the policy on Coldcard')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Coldcard policy' })).toBeVisible();
  const coldcardDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Coldcard policy' }).click();
  await expect((await coldcardDownload).suggestedFilename()).toBe('coldcard-policy-vaul.txt');
  await expect(page.getByText('Coldcard policy saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show in Finder' })).toBeVisible();
  await expect(page.getByLabel('Policy verified on every Coldcard')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Set the coordinator PIN' })).toBeVisible();
  await expect(page.getByLabel('App PIN', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Finish hardware setup before first signature' }).click();
  await expect(page.getByLabel('App PIN', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Create wallet' })).toBeDisabled();
});

test('creates and verifies a simple 2-of-3 descriptor wallet', async ({ page }) => {
  test.setTimeout(60_000);
  const hardwareKeys = [
    { ...keys[0], fingerprint: 'f00dbabe' },
    { ...keys[1], fingerprint: '1ed9e001' },
    { ...keys[2], fingerprint: 'c0ffee01' }
  ];
  await page.goto('/multisig/new');
  await expect(page.getByRole('heading', { name: 'Create a policy wallet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Recover from backup' })).toBeVisible();
  await continueToSigners(page, 'Family vault');

  for (const key of hardwareKeys) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Signer label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
    await expect(page.getByText(key.label, { exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Review wallet' }).click();
  await expect(page.getByRole('link', { name: 'Recover from backup' })).toHaveCount(0);
  await expect(page.getByText('2 of 3 signatures')).toBeVisible();
  await page.getByRole('button', { name: 'About wallet descriptors' }).hover();
  await expect(page.getByRole('tooltip')).toContainText('public, watch-only recipe');
  await page.getByRole('button', { name: 'Descriptor logic' }).click();
  await expect(page.getByTestId('descriptor-preview')).toContainText('wsh(sortedmulti(2,');
  await expect(page.getByText('Portable wallet descriptor', { exact: true })).toBeVisible();
  await expect(page.getByTestId('descriptor-preview')).toContainText('/<0;1>/*');
  await expect(page.getByRole('button', { name: 'Copy wallet descriptor' })).toBeVisible();
  await page.getByText('View separate receive and change descriptors').click();
  await expect(page.getByRole('button', { name: 'Copy receive descriptor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy change descriptor' })).toBeVisible();
  await saveSetupDescriptor(page, 'family-vault-descriptors.txt');
  await expect(page.getByRole('button', { name: 'Show in Finder' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  const creationProgress = page.getByRole('navigation', { name: 'Wallet creation progress' });
  await expect(creationProgress.locator('li.complete')).toHaveCount(3);
  await expect(creationProgress.locator('li.complete svg')).toHaveCount(3);
  await expect(creationProgress.locator('li.current')).toContainText('Back up');
  await expect(page.getByRole('heading', { name: 'Save the wallet descriptor' })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.locator('.setup-task.complete')).toContainText('View completed step');
  await expect(page.locator('.setup-task.current')).toContainText('Register the policy on Coldcard');
  await page.getByRole('button', { name: 'Finish hardware setup before first signature' }).click();
  await expect(page.locator('.setup-task.deferred').filter({ hasText: 'Required before signing' })).toHaveCount(2);
  await expect(page.locator('.setup-task.current')).toContainText('Set the coordinator PIN');
  await expect(page.getByRole('heading', { name: 'Set the coordinator PIN' })).toBeVisible();
  await page.getByLabel('App PIN', { exact: true }).fill('coordinator-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();

  await expect(page).toHaveURL(/\/multisig$/);
  await expect(page.getByRole('heading', { name: 'Family vault' })).toBeVisible();
  await expect(page.locator('header').getByText('2 of 3')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Receive' }).click();
  await expect(page.getByRole('heading', { name: 'Receive bitcoin' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code for/ })).toBeVisible();
  await page.getByRole('button', { name: 'New receive address' }).click();
  const receiveDialog = page.getByRole('dialog', { name: 'New receive address' });
  await receiveDialog.getByLabel('Permanent label').fill('Vault deposit test');
  await receiveDialog.getByRole('button', { name: 'Generate address' }).click();
  await expect(page.locator('.receive-card').getByText('Vault deposit test', { exact: true })).toBeVisible();
  await expect(page.getByText('Receive address ready')).toBeVisible();

  await page.getByRole('link', { name: 'Back to overview' }).click();
  await page.locator('a:visible').filter({ hasText: /^Send$/ }).click();
  await page.getByLabel('Bitcoin address').fill('bcrt1qvaultdestination0000000000000000000000000');
  await page.getByLabel('Payment label').fill('Vault test payment');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('50000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  const paymentSigners = page.getByRole('region', { name: 'Payment signers' });
  await expect(paymentSigners.getByText('0 of 2 collected')).toBeVisible();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  await page.getByRole('button', { name: /Virtual Ledger outsider/ }).click();
  const signingPolicyReview = page.getByRole('dialog', { name: 'Review signer wallet policy' });
  await signingPolicyReview.getByLabel('I will compare every fingerprint, path, and public key').check();
  await signingPolicyReview.getByRole('button', { name: 'Verify policy & first address' }).click();
  await expect(signingPolicyReview.getByText('Policy reference saved in Groot')).toBeVisible();
  await signingPolicyReview.getByRole('button', { name: 'Start Ledger review & signing' }).click();
  await expect(signingPolicyReview).toBeVisible();
  await expect(signingPolicyReview.getByText(/must authorize this policy again/)).toBeVisible();
  await signingPolicyReview.getByRole('button', { name: 'Policy approved — show transaction' }).click();
  await expect(signingPolicyReview).toBeHidden();
  const hardwareSigning = page.getByRole('dialog', { name: 'Sign with hardware' });
  await expect(hardwareSigning.getByText('Transaction to verify', { exact: true })).toBeVisible();
  await expect(hardwareSigning.getByLabel('Waiting for hardware signature')).toBeVisible();
  await expect(hardwareSigning.getByRole('button', { name: 'View policy reference' })).toBeVisible();
  await expect(paymentSigners.getByText('1 of 2 collected')).toBeVisible();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  await page.getByRole('button', { name: /Virtual Coldcard/ }).click();
  const coldcardSetup = page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' });
  await expect(coldcardSetup.getByText('Import once before signing', { exact: true })).toBeVisible();
  await coldcardSetup.getByLabel(/I imported and verified this policy/).check();
  await coldcardSetup.getByRole('button', { name: 'Continue to signing' }).click();
  await expect(paymentSigners.getByText('2 of 2 collected')).toBeVisible();
  await page.getByLabel('App PIN', { exact: true }).fill('wrong-pin');
  await page.getByRole('button', { name: 'Finalize & broadcast' }).click();
  await expect(page.getByText('Incorrect app PIN.')).toBeVisible();
  await page.getByLabel('App PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Finalize & broadcast' }).click();
  await expect(page.getByRole('heading', { name: 'Transaction broadcast' })).toBeVisible();

  await page.getByRole('link', { name: 'Return to wallet' }).click();
  await page.getByRole('link', { name: 'Export & verify' }).click();
  const exportCard = page.locator('.backup-export-card');
  await page.getByRole('button', { name: /Groot JSON/ }).click();
  await expect(exportCard.getByText('Re-authenticate this export')).toBeVisible();
  await expect(exportCard.getByText(/exported descriptor is not encrypted/)).toBeVisible();
  await page.getByLabel('Backup app PIN', { exact: true }).fill('wrong-pin');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  await expect(exportCard.getByText('That app PIN does not match Family vault.')).toBeVisible();
  await expect(page.locator('.danger-card')).not.toContainText('That app PIN does not match Family vault.');
  await page.getByLabel('Backup app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(/"network": "regtest"/);
  const descriptorBackup = await page.getByLabel('Descriptor backup', { exact: true }).inputValue();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  await expect((await downloadPromise).suggestedFilename()).toBe('family-vault-backup.json');
  await page.emulateMedia({ media: 'print' });
  const printSheet = page.locator('.backup-print-sheet');
  await expect(printSheet).toBeVisible();
  await expect(exportCard).toBeHidden();
  await expect(printSheet.getByText('Invalid Date', { exact: true })).toHaveCount(0);
  await expect(printSheet.getByText(/UTC$/)).toBeVisible();
  expect(await printSheet.locator('.print-descriptors').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  for (const qr of await printSheet.locator('.print-descriptors img').all()) {
    expect(await qr.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180);
  }
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { window.print = () => document.documentElement.setAttribute('data-print-called', 'true'); });
  await page.getByRole('button', { name: 'Print / save PDF' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-called', 'true');
  await page.getByLabel('Backup file import').setInputFiles({
    name: 'family-vault-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(descriptorBackup),
  });
  await expect(page.locator('.file-action.file-loaded')).toBeVisible();
  await expect(page.locator('.file-action').getByText('family-vault-backup.json', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run recovery drill' }).click();
  await expect(page.getByText('Backup verified')).toBeVisible();
  await page.getByLabel('Wallet name confirmation').fill('Family vault typo');
  await page.getByLabel('Delete wallet app PIN', { exact: true }).fill('coordinator-pin');
  await expect(page.getByRole('button', { name: 'Delete wallet from this device' })).toBeDisabled();
  await page.getByLabel('Wallet name confirmation').fill('Family vault');
  await page.getByLabel('Delete wallet app PIN', { exact: true }).fill('wrong-pin');
  await page.getByRole('button', { name: 'Delete wallet from this device' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Permanently delete this wallet?' });
  await deleteDialog.getByRole('button', { name: 'Keep wallet' }).click();
  await expect(deleteDialog).toBeHidden();
  await page.getByRole('button', { name: 'Delete wallet from this device' }).click();
  const reopenedDeleteDialog = page.getByRole('dialog', { name: 'Permanently delete this wallet?' });
  await expect(reopenedDeleteDialog).toBeVisible();
  await reopenedDeleteDialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('.danger-card').getByText('That app PIN does not match Family vault.')).toBeVisible();
  await page.getByLabel('Delete wallet app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Delete wallet from this device' }).click();
  await page.getByRole('dialog', { name: 'Permanently delete this wallet?' }).getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  if ((page.viewportSize()?.width ?? 1180) <= 760) {
    await page.locator('.wallet-manager').getByRole('button', { name: /Add wallet/ }).click();
  } else {
    await page.getByRole('complementary').getByRole('link', { name: /Add wallet/ }).click();
  }
  await page.getByRole('button', { name: 'Add wallet' }).click();
  await page.getByRole('link', { name: /Use multiple keys/ }).click();
  await page.getByRole('link', { name: /Recover from backup/ }).click();
  await page.getByLabel('Recovery descriptor backup').fill(descriptorBackup);
  await page.getByRole('button', { name: 'Validate backup' }).click();
  await expect(page.getByText('Backup is valid')).toBeVisible();
  await page.getByLabel('I verified the first receive address').check();
  await page.getByLabel('New wallet app PIN', { exact: true }).fill('restored-pin');
  await page.getByLabel('Confirm new wallet app PIN', { exact: true }).fill('restored-pin');
  await page.getByRole('button', { name: 'Recover wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Family vault' })).toBeVisible();
});

test('exports and validates the recommended BSMS record', async ({ page }) => {
  await page.goto('/multisig/backup');
  await page.getByLabel('Backup app PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(/^BSMS 1\.0\n/);
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(/\/0\/\*,\/1\/\*/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download BSMS' }).click();
  await expect((await downloadPromise).suggestedFilename()).toBe('family-wallet.bsms');
  await page.getByRole('button', { name: 'Run recovery drill' }).click();
  await expect(page.getByText('Backup verified')).toBeVisible();
});

test('shows one authoritative failure when a BSMS record belongs to another wallet', async ({ page }) => {
  await page.goto('/multisig/backup');
  await page.getByLabel('Backup app PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  const exported = await page.getByLabel('Descriptor backup', { exact: true }).inputValue();
  const mismatched = exported.replace('/**', '/9/**');
  await page.getByLabel('Backup file import').setInputFiles({
    name: 'different-wallet.bsms',
    mimeType: 'text/plain',
    buffer: Buffer.from(mismatched),
  });
  await expect(page.locator('.file-action').getByText('different-wallet.bsms', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run recovery drill' }).click();
  await expect(page.locator('.drill-result').getByText('Backup does not match', { exact: true })).toBeVisible();
  await expect(page.getByText('Recovery drill passed', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete wallet from this device' })).toBeDisabled();
});

test('reveals draft errors only after review and keeps cosigner identity readable', async ({ page }) => {
  await page.goto('/multisig/new');
  await page.getByRole('button', { name: 'Continue to signers' }).click();
  await expect(page.getByText('A wallet name is required.')).toBeVisible();
  await continueToSigners(page, 'Incomplete vault');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Enter public key' }).click();
  await page.getByLabel('Signer label').fill(keys[0].label);
  await page.getByLabel('Master fingerprint').fill(keys[0].fingerprint);
  await page.getByLabel('Account xpub').fill(keys[0].xpub);
  await page.getByRole('button', { name: 'Add key' }).click();

  await expect(page.getByText('Device fingerprint', { exact: true })).toBeVisible();
  await expect(page.getByText('Manual entry', { exact: true })).toBeVisible();
  await expect(page.getByText(keys[0].xpub, { exact: true })).toBeVisible();
  await expect(page.locator('.policy-errors')).toHaveCount(0);

  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  const details = page.getByRole('dialog', { name: 'Coldcard' });
  await expect(details).toBeVisible();
  await expect(details.getByText('Not checked in this session')).toBeVisible();
  await details.getByRole('button', { name: 'Run health check' }).click();
  await expect(details.getByText(/Physical presence cannot be checked for an offline key/)).toBeVisible();
  await details.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Review wallet' }).click();
  await expect(page.getByText('Add 2 more signers.')).toBeVisible();
  await expect(page.getByText('The threshold cannot exceed the number of signers.')).toHaveCount(0);
  const keyLayout = await page.locator('.cosigner-public-key code').evaluate((element) => ({
    whiteSpace: getComputedStyle(element).whiteSpace,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(keyLayout.whiteSpace).toBe('normal');
  expect(keyLayout.scrollWidth).toBeLessThanOrEqual(keyLayout.clientWidth);
});

test('compiles and simulates guided Miniscript recovery policies', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Policy lab vault');
  for (const key of keys) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Signer label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  await saveSetupDescriptor(page, 'policy-lab-vault-descriptors.txt');
  await page.getByRole('button', { name: 'Finish hardware setup before first signature' }).click();
  await expect(page.getByLabel('App PIN', { exact: true })).toBeEnabled();
  await page.getByLabel('App PIN', { exact: true }).fill('policy-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('policy-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await page.getByRole('link', { name: 'Recovery policy lab' }).click();
  await expect(page.getByText('Experimental analysis only')).toBeVisible();
  await expect(page.getByText('This lab never changes the selected wallet.')).toBeVisible();
  await expect(page.getByText('Separate recovery key required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compile & analyze policy' })).toBeDisabled();
  await page.getByLabel('Policy template').selectOption('decaying');
  await page.getByRole('button', { name: 'Compile & analyze policy' }).click();
  await expect(page.getByText('Sanity checked')).toBeVisible();
  await expect(page.getByText(/intentionally reduce theft resistance/)).toBeVisible();
});

test('creates a guided recovery descriptor from a visible template', async ({ page }) => {
  await page.goto('/multisig/new');
  await page.getByRole('button', { name: /Recovery path/ }).click();
  await expect(page.getByText('Four independent keys required')).toBeVisible();
  await continueToSigners(page, 'Resilient vault');
  for (const key of [...keys, recoveryKey]) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Signer label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await expect(page.getByText('Recovery-only signer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await expect(page.getByText('2 of 4 signatures')).toBeVisible();
  await page.getByRole('button', { name: 'Descriptor logic' }).click();
  await expect(page.getByTestId('descriptor-preview')).toContainText('4,320 blocks');
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  await saveSetupDescriptor(page, 'resilient-vault-descriptors.txt');
  await page.getByRole('button', { name: 'Finish hardware setup before first signature' }).click();
  await expect(page.getByLabel('App PIN', { exact: true })).toBeEnabled();
  await page.getByLabel('App PIN', { exact: true }).fill('recovery-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('recovery-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Resilient vault' })).toBeVisible();
});

test('blocks a duplicate device before review', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Duplicate test');
  for (const key of [keys[0], { ...keys[1], fingerprint: keys[0].fingerprint }, keys[2]]) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Signer label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await expect(page.getByText('Every signer must have a unique master fingerprint.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await expect(page.getByText('Every signer must have a unique master fingerprint.')).toBeVisible();
});

test('coordinator has no horizontal overflow on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout assertion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/multisig/new');
  const sizes = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  await expect(page.getByRole('button', { name: 'Continue to signers' })).toBeVisible();
  await continueToSigners(page, 'Mobile vault');
  await expect(page.getByRole('button', { name: 'Add a signer' })).toBeVisible();
  const motion = await page.locator('.form-card').first().evaluate((element) => ({
    animationDuration: getComputedStyle(element).animationDuration,
    transitionDuration: getComputedStyle(element).transitionDuration
  }));
  expect(parseFloat(motion.animationDuration || '0')).toBeLessThanOrEqual(0.001);
  expect(parseFloat(motion.transitionDuration || '0')).toBeLessThanOrEqual(0.001);
});
