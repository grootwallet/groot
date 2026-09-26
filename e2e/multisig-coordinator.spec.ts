import { expect, test, type Page } from '@playwright/test';

const keys = [
  { label: 'Coldcard', fingerprint: 'a1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-1' },
  { label: 'Ledger', fingerprint: 'b1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-2' },
  { label: 'Trezor', fingerprint: 'c1b2c3d4', xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-3' }
];
const recoveryKey = {
  label: 'Recovery key',
  fingerprint: 'd1b2c3d4',
  xpub: 'tpubD6NzVbkrYhZ4Y-e2e-public-key-4'
};

async function continueToSigners(page: Page, name: string) {
  const configure = page.getByRole('button', { name: 'Continue', exact: true });
  const walletName = page.getByLabel('Wallet name');
  await configure.or(walletName).first().waitFor();
  if (await configure.isVisible()) await configure.click();
  await walletName.fill(name);
  await page.getByRole('button', { name: 'Continue to signers' }).click();
}

async function saveSetupDescriptor(page: Page, expectedFilename: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save public descriptor text|Save another copy/ }).click();
  await expect((await download).suggestedFilename()).toBe(expectedFilename);
  await expect(page.getByText('Descriptor backup saved', { exact: true })).toBeVisible();
}

async function revealInsight(page: Page, label: string, mobile: boolean) {
  const trigger = page.getByRole('button', { name: label });
  if (mobile) await trigger.click();
  else await trigger.hover();
}

test('routes receive address creation through the selected wallet kind', async ({ page }) => {
  await page.goto('/multisig/receive');
  await expect(page).toHaveURL(/\/receive$/);
  await expect(page.getByRole('heading', { name: 'Receive bitcoin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New receive address' })).toBeVisible();
  const refresh = page.getByRole('button', { name: 'Refresh payments' });
  await expect(refresh).toBeVisible();
  await refresh.click();
  await expect(page.getByRole('button', { name: 'Refreshing payments…' })).toBeDisabled();
  await expect(page.getByText('Incoming payments and receive addresses refreshed.')).toBeVisible();
  await expect(page).toHaveURL(/\/receive$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('disabled loading buttons keep visibly rotating until the operation ends', async ({
  page
}) => {
  await page.goto('/multisig');
  const indicator = page.locator('.button-loading-indicator');
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.className = 'button';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML =
      '<span class="button-loading-indicator" aria-hidden="true"></span><span>Working…</span>';
    document.body.append(button);
  });
  await expect(indicator).toBeVisible();
  expect(await indicator.evaluate((element) => getComputedStyle(element, '::after').content)).toBe(
    'none'
  );
  const transforms = new Set<string>();
  for (let frame = 0; frame < 5; frame += 1) {
    transforms.add(await indicator.evaluate((element) => getComputedStyle(element).transform));
    await page.waitForTimeout(170);
  }
  expect(transforms.size).toBeGreaterThanOrEqual(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedDuration = await indicator.evaluate(
    (element) => getComputedStyle(element).animationDuration
  );
  expect(parseFloat(reducedDuration)).toBeLessThanOrEqual(0.001);
  await expect(page.getByRole('button', { name: 'Working…' })).toBeDisabled();
});

test('offline policy keeps the public reference available and shows one actionable warning', async ({
  page
}) => {
  await page.goto('/multisig?fixture-policy-status-offline=1');
  await expect(page.getByText('Wallet data is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open network settings' })).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(1);

  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  await page.getByRole('button', { name: 'Review setup' }).click();
  const policy = page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' });
  await expect(policy.getByText('microSD card or enabled Virtual Disk')).toBeVisible();
  await expect(policy.getByRole('button', { name: 'Complete policy registration' })).toBeDisabled();
  await policy.getByText('Review all signer public keys').click();
  await expect(
    policy.getByRole('button', { name: 'Public account key (xpub)' }).first()
  ).toBeVisible();
});

test('Coldcard policy registration completes with an explicit on-device confirmation', async ({
  page
}) => {
  await page.goto('/multisig');
  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  await page.getByRole('button', { name: 'Review setup' }).click();
  const policy = page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' });
  await policy.getByRole('checkbox').check();
  await policy.getByRole('button', { name: 'Complete policy registration' }).click();
  await expect(policy).not.toBeVisible();
  await expect(page.getByText('Coldcard policy recorded', { exact: true })).toBeVisible();
});

test('uses signer terminology across multisig user flows', async ({ page }) => {
  for (const route of [
    '/multisig',
    '/multisig/new',
    '/multisig/receive',
    '/multisig/backup',
    '/multisig/policy'
  ]) {
    await page.goto(route);
    await expect(page.locator('body')).not.toContainText(/cosigner/i);
  }
});

test('keeps localized wallet policy content contained at compact desktop widths', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-width layout assertion');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'FR', exact: true }).click();
  await page.goto('/multisig');
  const signerList = page.locator('.saved-cosigner-list');
  await expect(signerList).toContainText('Configuration non enregistrée');
  await expect(signerList).toContainText('Aucun réglage requis');
  await expect(signerList).toContainText('Non certifié');

  for (const width of [1180, 950, 761]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Clés de signature' })).toBeVisible();
    await expect(signerList).not.toContainText(
      /Policy verified|No setup needed|Setup required|Setup not recorded|Policy imported|Not certified|Not supported/
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);

    const backupCard = page.locator('.vault-backup-card');
    const backupBounds = await backupCard.boundingBox();
    expect(backupBounds).toBeTruthy();
    for (const button of await backupCard.getByRole('link').all()) {
      const bounds = await button.boundingBox();
      expect(bounds).toBeTruthy();
      expect(bounds!.x).toBeGreaterThanOrEqual(backupBounds!.x);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(backupBounds!.x + backupBounds!.width);
      expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
    }

    for (const row of await page.locator('.saved-cosigner-list button').all()) {
      expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
    }
    for (const badge of await page.locator('.saved-cosigner-list .ready-badge').all()) {
      expect((await badge.boundingBox())?.height).toBeLessThanOrEqual(25);
    }
    const recoveryLab = backupCard.getByRole('link', { name: 'Laboratoire de récupération' });
    await expect(recoveryLab).toHaveCount(0);
    expect(
      await page
        .locator('.wallet-switcher-label')
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);
  }
});

test('renames a saved signer from its reusable details modal', async ({ page }) => {
  await page.goto('/multisig');
  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  const details = page.getByRole('dialog', { name: 'Coldcard' });
  await details.getByRole('button', { name: 'Edit name' }).click();
  await details.getByLabel('Signer name').fill('Office Coldcard');
  await details.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('dialog', { name: 'Office Coldcard' })).toBeVisible();
  await expect(page.getByText('Signer renamed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'View Office Coldcard details' })).toBeVisible();
});

test('keeps multisig receive verification disclosure visibly expandable', async ({ page }) => {
  await page.goto('/');
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  if (isMobile) {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page
      .locator('.wallet-manager')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  } else {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  if (isMobile)
    await page
      .locator('a:visible')
      .filter({ hasText: /^Receive$/ })
      .click();
  else await page.getByRole('main').getByRole('link', { name: 'Receive' }).click();
  await expect(page.getByRole('link', { name: 'Back to overview', exact: true })).toHaveCount(0);
  const awaitingAddresses = page.locator('.awaiting-addresses');
  await expect(
    awaitingAddresses.getByText('Hardware not verified', { exact: true }).first()
  ).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('fixture-hardware-review-rejected', '1'));
  await page.getByRole('button', { name: 'Verify on device' }).click();
  const dialog = page.getByRole('dialog', { name: 'Verify receive address' });
  await expect(
    page.getByRole('status', { name: 'Hardware device scan in progress' }).or(dialog).first()
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText(/cosigner/i);
  const details = dialog.locator('details.verification-details');
  const summary = details.locator('summary');
  const reviewedAddress = await dialog.locator('.readable-address-groups').textContent();
  await expect(summary.getByText('Address details', { exact: true })).toBeVisible();
  await expect(summary.locator('svg')).toBeVisible();
  await expect(details).not.toHaveAttribute('open', '');
  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  await expect(dialog.getByText('Derivation', { exact: true })).toBeVisible();
  await summary.click();
  await expect(details).not.toHaveAttribute('open', '');
  const lockedTrezor = dialog.getByRole('button', { name: /Virtual Trezor One/ });
  await expect(lockedTrezor).toBeEnabled();
  await expect(lockedTrezor).toContainText('Locked');
  await expect(lockedTrezor).toContainText('Wallet membership unknown · unlock to identify');
  const outsider = dialog.getByRole('button', { name: /Virtual Trezor Standard/ });
  await expect(outsider).toContainText('Not part of this wallet');
  await expect(outsider).toBeDisabled();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme
    );
    await page.screenshot({
      path: `/private/tmp/groot-membership-${page.viewportSize()?.width}-${theme}.png`,
      fullPage: true,
      animations: 'disabled'
    });
  }
  await lockedTrezor.click();
  const pinDialog = page.getByRole('dialog', { name: 'Unlock Trezor' });
  await expect(pinDialog.getByText('Match locations, not numbers')).toBeVisible();
  await pinDialog.getByRole('button', { name: 'Top left position' }).click();
  await pinDialog.getByRole('button', { name: 'Bottom center position' }).click();
  await pinDialog.getByRole('button', { name: 'Unlock Trezor' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.readable-address-groups')).toHaveText(reviewedAddress ?? '');
  await expect(dialog.getByRole('button', { name: /^Trezor / })).toContainText('Ready');
  await dialog.getByRole('button', { name: /^Trezor / }).click();
  await expect(dialog.getByRole('status', { name: 'Waiting for hardware approval' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveClass(/modal-attention/);
  await expect(
    dialog.getByRole('status', { name: 'Waiting for hardware cancellation' })
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Verify on device' })).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('fixture-hardware-review-rejected'));
  await page.getByRole('button', { name: 'Verify on device' }).click();
  await expect(dialog.getByRole('button', { name: /^Trezor / })).toContainText('Ready');
  await dialog.getByRole('button', { name: /^Trezor / }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Verified on hardware/ })).toBeVisible();
  await expect(
    awaitingAddresses.getByText('Hardware verified', { exact: true }).first()
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show address details', exact: true }).click();
  await expect(page.getByText('Native SegWit · standard multisig', { exact: true })).toBeVisible();
  await expect(page.getByText('Descriptor · Miniscript', { exact: true })).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme
    );
    await page.screenshot({
      path: `/private/tmp/groot-receive-followup-${page.viewportSize()?.width}-${theme}.png`,
      fullPage: true,
      animations: 'disabled'
    });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('multisig RBF keeps a safe replacement-specific default when estimates are unavailable', async ({
  page
}) => {
  await page.goto(
    '/multisig/send?fixture-fee-estimates-unavailable=1&accelerate=rbf&txid=6a1b2c3d4e5f67890123456789abcdef6a1b2c3d4e5f67890123456789abcdef'
  );

  await expect(page.getByRole('heading', { name: 'Speed up transaction' })).toBeVisible();
  await expect(page.getByText('You will spend this much more', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Custom acceleration fee rate')).toBeHidden();
  const review = page.getByRole('button', { name: 'Continue to sign' });
  await expect(review).toBeEnabled();
  await expect(page.getByLabel('Custom acceleration fee rate')).not.toHaveValue('0');
  await review.click();
  const transactionReview = page.getByRole('region', { name: 'Transaction review' });
  await expect(transactionReview).toBeVisible();
  await expect(page.getByRole('region', { name: 'Payment signers' })).toContainText('2 of 3');
});

test('confirmed original stops fee acceleration on both wallet routes', async ({ page }) => {
  for (const route of ['/send', '/multisig/send']) {
    await page.goto(
      `${route}?accelerate=rbf&fixture-acceleration-confirmed=1&txid=6a1b2c3d4e5f67890123456789abcdef6a1b2c3d4e5f67890123456789abcdef`
    );
    await expect(
      page.getByRole('heading', { name: 'Transaction already confirmed' })
    ).toBeVisible();
    await expect(
      page.getByText('No fee increase is needed. You can return to Overview.').first()
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to sign' })).toHaveCount(0);
    await expect(page.getByText('FEE ACCELERATION', { exact: true })).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme
      );
      await page.screenshot({
        path: `/private/tmp/groot-confirmed-${route.includes('multisig') ? 'multi' : 'single'}-${page.viewportSize()?.width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled'
      });
    }
  }
});

test('multisig RBF explains a full-balance funding shortfall without a zero default', async ({
  page
}) => {
  await page.goto(
    '/multisig/send?fixture-rbf-insufficient-funds=1&accelerate=rbf&txid=6a1b2c3d4e5f67890123456789abcdef6a1b2c3d4e5f67890123456789abcdef'
  );

  await expect(page.getByRole('heading', { name: 'Enter a custom fee rate' })).toBeVisible();
  const rate = page.getByLabel('Custom acceleration fee rate');
  await expect(rate).toHaveValue('');
  await expect(rate).toHaveAttribute('placeholder', 'Enter a fee rate');
  await expect(page.getByRole('alert')).toContainText('Not enough bitcoin to raise the fee.');
  await expect(page.getByRole('button', { name: 'Continue to sign' })).toBeDisabled();
});

test('keeps multisig PSBT actions inside the review card', async ({ page }) => {
  await page.goto('/multisig/send');
  await page.getByLabel('Payment label').fill('Responsive action test');
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('50000');
  await page.getByRole('button', { name: 'Show transaction amount in BTC' }).click();
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('0.00050000');
  await page.getByRole('button', { name: 'Show transaction amount in sats' }).click();
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('50000');
  await page.getByRole('button', { name: 'Review payment' }).click();

  const psbtActions = page.locator('.psbt-actions');
  const psbtActionBounds = await psbtActions.boundingBox();
  expect(psbtActionBounds).toBeTruthy();
  const buttons = await psbtActions.getByRole('button').all();
  const buttonBounds = [];
  for (const button of buttons) {
    const bounds = await button.boundingBox();
    expect(bounds).toBeTruthy();
    buttonBounds.push(bounds!);
    expect(bounds!.x).toBeGreaterThanOrEqual(psbtActionBounds!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      psbtActionBounds!.x + psbtActionBounds!.width
    );
    expect(await button.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true
    );
  }
  const columnCount = new Set(buttonBounds.map((bounds) => Math.round(bounds.x))).size;
  expect(columnCount).toBe(test.info().project.name === 'mobile' ? 1 : 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  if (test.info().project.name === 'desktop') {
    await page.setViewportSize({ width: 1440, height: 900 });
    const wideButtons = await psbtActions.getByRole('button').all();
    const wideColumns = new Set<number>();
    for (const button of wideButtons) {
      const bounds = await button.boundingBox();
      expect(bounds).toBeTruthy();
      wideColumns.add(Math.round(bounds!.x));
    }
    expect(wideColumns.size).toBe(3);
  }
});

test('discards a resumed payment draft without creating a proposal', async ({ page }) => {
  await page.goto('/');
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  if (isMobile) {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page
      .locator('.wallet-manager')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  } else {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Payment label').fill('Draft to discard');
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByRole('button', { name: 'Continue to amount' }).click();

  await page.getByRole('link', { name: 'Back to overview' }).click();
  const draftCallout = page.locator('.active-draft-callout');
  await expect(draftCallout).toContainText('Payment draft in progress');
  await expect(draftCallout.getByRole('button', { name: 'Discard draft' })).toBeVisible();
  await draftCallout.getByRole('link', { name: /Resume payment draft/ }).click();

  await expect(page).toHaveURL(/\/multisig\/send$/);
  await expect(page.getByRole('button', { name: 'Discard draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard draft' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard this payment draft?' });
  await expect(dialog.getByText('No transaction or signature exists yet.')).toHaveCount(0);
  await expect(dialog.getByText('Saved fields')).toHaveCount(0);
  await expect(dialog).toContainText('Draft to discard');
  await dialog.getByRole('button', { name: 'Discard draft' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Payment draft discarded', { exact: true })).toBeVisible();
  await expect(page.locator('.active-draft-callout')).toHaveCount(0);
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard draft' })).toHaveCount(0);
  await expect(page.getByLabel('Bitcoin address')).toHaveValue('');
});

test('multisig receive and send cap manual label drafts at five', async ({ page }) => {
  await page.goto('/multisig');
  await page.getByRole('main').getByRole('link', { name: 'Receive' }).click();
  await page.getByRole('button', { name: 'New receive address' }).click();
  await page.getByLabel('Label', { exact: true }).fill('V1,V2,V3,V4,V5,V6;');
  await expect(page.locator('.label-token')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Remove V6' })).toHaveCount(0);
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/multisig');
  await page.getByRole('main').getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Payment label').fill('P1;P2;P3;P4;P5;P6;');
  await expect(page.locator('.label-token')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Remove P6' })).toHaveCount(0);
  await expect(page.getByLabel('Payment label')).toHaveValue('');
  await expect(page.locator('.label-suggestions button')).toHaveCount(0);
});

test('spends end-to-end from the ready-made demo wallet', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied = value;
        },
        readText: async () => copied
      }
    });
  });
  await page.goto('/multisig');
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  await expect(page.locator('.vault-policy-tags .policy-pill')).toHaveText('2 of 3 keys');
  await expect(page.getByText('Ready-to-test demo wallet')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Payment label')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove Test purchase' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('50000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  const transactionReview = page.getByRole('region', { name: 'Transaction review' });
  await expect(transactionReview.getByLabel('Assigned labels')).toContainText('Test purchase');
  await expect(page.getByRole('button', { name: '2 more signatures required' })).toBeDisabled();
  await expect(page.getByText('Fee rate', { exact: true })).toBeHidden();
  await page.getByText('View more details', { exact: true }).click();
  await expect(page.getByText('Fee rate', { exact: true })).toBeVisible();
  await expect(page.getByText('Transaction inputs', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View complete recipient address' }).click();
  const addressDialog = page.getByRole('dialog', { name: 'Recipient address' });
  await expect(addressDialog.getByRole('button', { name: 'Copy exact address' })).toBeVisible();
  await expect(
    addressDialog.getByText('Spaces are visual only. Copy always uses the exact address.', {
      exact: true
    })
  ).toHaveCount(0);
  await addressDialog.getByRole('button', { name: 'Close' }).click();
  const psbtDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PSBT' }).click();
  const downloadedPsbt = await psbtDownload;
  await expect(downloadedPsbt.suggestedFilename()).toMatch(/^groot-[a-z0-9]{1,6}-s0\.psbt$/);
  const savedChunks: Buffer[] = [];
  for await (const chunk of await downloadedPsbt.createReadStream())
    savedChunks.push(Buffer.from(chunk));
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
  await page.getByRole('button', { name: 'Import signed PSBT' }).click();
  const rejectedImport = page.getByRole('dialog', { name: 'Import signed PSBT' });
  await rejectedImport.getByRole('textbox', { name: 'Signed PSBT' }).fill('fixture-rejected-psbt');
  await rejectedImport.getByRole('button', { name: 'Validate & merge' }).click();
  await expect(rejectedImport.getByRole('alert')).toContainText('Signed PSBT rejected');
  await expect(rejectedImport.getByRole('alert')).toContainText(
    'does not match the transaction you reviewed'
  );
  await expect(page.locator('.toast').filter({ hasText: 'Signed PSBT rejected' })).toBeVisible();
  await expect(signerSummary.getByText('0 of 2 collected')).toBeVisible();
  await rejectedImport.getByRole('button', { name: 'Cancel' }).click();
  const durableImportError = page
    .getByRole('region', { name: 'Transaction review' })
    .getByRole('alert');
  await expect(durableImportError).toContainText('Payment action failed');
  await expect(durableImportError).toContainText(
    'The PSBT does not match the transaction you reviewed. No signatures were changed.'
  );
  expect(await durableImportError.evaluate((element) => getComputedStyle(element).textAlign)).toBe(
    'left'
  );
  expect(
    await durableImportError.evaluate((element) => getComputedStyle(element).marginTop)
  ).not.toBe('0px');
  await page.getByRole('button', { name: 'Import signed PSBT' }).click();
  await expect(rejectedImport.getByRole('textbox', { name: 'Signed PSBT' })).toHaveValue('');
  await expect(rejectedImport.getByRole('alert')).toHaveCount(0);
  await rejectedImport.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Show unsigned QR' }).click();
  const unsignedQrDialog = page.getByRole('dialog', { name: 'Unsigned PSBT' });
  const unsignedQrImage = unsignedQrDialog.getByRole('img', { name: /QR frame/ });
  await expect(unsignedQrImage).toBeVisible();
  await expect(unsignedQrDialog.getByText(/Frame \d+ of (?:[2-9]|\d{2,})/)).toBeVisible();
  const frameCount = Number(
    (await unsignedQrImage.getAttribute('alt'))?.match(/of (\d+)/i)?.[1] ?? 0
  );
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
  await expect(
    hardwareDialog.getByRole('button', { name: /Virtual Ledger outsider/ })
  ).toBeDisabled();
  await expect(hardwareDialog.getByText('Fee rate', { exact: true })).toBeHidden();
  const moreDetails = hardwareDialog.getByText('View more details', { exact: true });
  await expect(moreDetails).toHaveCSS('cursor', 'pointer');
  await expect(moreDetails.locator('xpath=..')).toHaveCSS('border-top-width', '0px');
  await moreDetails.click();
  await expect(hardwareDialog.getByText('Fee rate', { exact: true })).toBeVisible();
  await expect(hardwareDialog.getByText('Transaction inputs', { exact: true })).toHaveCount(0);
  await expect(
    hardwareDialog.getByRole('button', { name: /Virtual Ledger outsider/ })
  ).toContainText('Not part of this wallet');
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
  await expect(hardwareDialog.getByRole('button', { name: /^Trezor / })).toContainText('c0ffee01');
  await expect(hardwareDialog.getByRole('button', { name: /^Trezor / })).toContainText(
    'No setup needed'
  );
  await hardwareDialog.getByRole('button', { name: /^Coldcard / }).click();
  const coldcardSetup = page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' });
  if (await coldcardSetup.isVisible()) {
    await coldcardSetup
      .getByRole('checkbox', { name: /I imported and verified this policy/ })
      .check();
    await coldcardSetup.getByRole('button', { name: 'Continue to signing' }).click();
  }
  await expect(signerSummary.getByText('1 of 2 collected')).toBeVisible();
  await expect(page.getByRole('button', { name: '1 more signature required' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  const signedColdcard = hardwareDialog.getByRole('button', { name: /^Coldcard / });
  await expect(signedColdcard).toContainText('Already signed');
  await expect(signedColdcard).toBeDisabled();
  await expect(signerSummary.getByText('1 of 2 collected')).toBeVisible();
  await hardwareDialog.getByRole('button', { name: /^Trezor / }).click();
  await expect(signerSummary.getByText('2 of 2 collected')).toBeVisible();
  await expect(page.getByRole('button', { name: /more signatures? required/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finalize & broadcast' })).toBeVisible();
  const saveSignedPsbt = page.getByRole('button', { name: 'Save signed PSBT' });
  await expect(saveSignedPsbt).toBeVisible();
  await expect
    .poll(async () => {
      const saveButton = await saveSignedPsbt.boundingBox();
      const pinLabel = await page.locator('.password-field .field-label').boundingBox();
      return (pinLabel?.y ?? 0) - ((saveButton?.y ?? 0) + (saveButton?.height ?? 0));
    })
    .toBeGreaterThanOrEqual(16);
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
  await page
    .getByRole('dialog', { name: 'Sign with hardware' })
    .getByRole('button', { name: /^Coldcard / })
    .click();
  const coldcardSetup = page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' });
  if (await coldcardSetup.isVisible()) {
    await coldcardSetup
      .getByRole('checkbox', { name: /I imported and verified this policy/ })
      .check();
    await coldcardSetup.getByRole('button', { name: 'Continue to signing' }).click();
  }
  await expect(cancellationSigners.getByText('1 of 2 collected', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel payment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this payment?' });
  await expect(dialog.getByText('Cancel confirmation test', { exact: true })).toBeVisible();
  const firstRow = dialog.locator('.cancel-proposal-details > div').first();
  const lastRow = dialog.locator('.cancel-proposal-details > div').last();
  expect(
    await firstRow.evaluate((element) => getComputedStyle(element.parentElement!).borderTopWidth)
  ).toBe('0px');
  expect(await lastRow.evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe(
    '0px'
  );
  const warning = dialog.locator('.warning-notice');
  expect(await firstRow.boundingBox()).not.toBeNull();
  expect(
    (await firstRow.boundingBox())!.y -
      ((await warning.boundingBox())!.y + (await warning.boundingBox())!.height)
  ).toBeGreaterThanOrEqual(12);
  await expect(dialog.getByText('25,000 sats', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 of 2 collected', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep payment' }).click();
  await expect(dialog).toBeHidden();
  await expect(cancellationSigners.getByText('1 of 2 collected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel payment' }).first().click();
  await dialog.getByRole('button', { name: 'Cancel payment' }).click();

  await expect(page.getByText('Payment canceled', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.goto('/multisig');
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  await expect(page.getByText('2,481,240 sats')).toBeVisible();
});

test('surfaces partial and fully signed proposals on Overview', async ({ page }) => {
  await page.goto('/');
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  if (isMobile) {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page
      .locator('.wallet-manager')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  } else {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Payment label').fill('Overview resume test');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('12000');
  await page.getByRole('button', { name: 'Review payment' }).click();

  await page.getByRole('button', { name: 'Sign with device' }).click();
  await page
    .getByRole('dialog', { name: 'Sign with hardware' })
    .getByRole('button', { name: /^Coldcard / })
    .click();
  const coldcardSetup = page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' });
  if (await coldcardSetup.isVisible()) {
    await coldcardSetup
      .getByRole('checkbox', { name: /I imported and verified this policy/ })
      .check();
    await coldcardSetup.getByRole('button', { name: 'Continue to signing' }).click();
  }
  await expect(
    page.getByRole('region', { name: 'Payment signers' }).getByText('1 of 2 collected')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to overview' }).click();
  await page
    .getByRole('dialog', { name: 'Leave signing?' })
    .getByRole('link', { name: 'Leave to overview' })
    .click();

  const partialProposal = page.getByRole('link', {
    name: 'Resume payment, Overview resume test, 1 of 2 signatures collected'
  });
  await expect(partialProposal).toContainText('Signing in progress');
  await expect(partialProposal).toContainText('Overview resume test');
  await expect(partialProposal).toHaveAttribute('href', /\/multisig\/send\?proposal=/);
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('#multisig-send-label-input'))
        document.body.dataset.flashedIntent = 'yes';
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await partialProposal.click();
  await expect(page).toHaveURL(/\/multisig\/send\?proposal=/);
  await expect(page.getByLabel('Assigned labels')).toContainText('Overview resume test');
  await expect(page.locator('body')).not.toHaveAttribute('data-flashed-intent', 'yes');
  await expect(
    page.getByRole('region', { name: 'Payment signers' }).getByText('1 of 2 collected')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sign with device' }).click();
  await page
    .getByRole('dialog', { name: 'Sign with hardware' })
    .getByRole('button', { name: /^Trezor / })
    .click();
  await expect(
    page.getByRole('region', { name: 'Payment signers' }).getByText('2 of 2 collected')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to overview' }).click();
  await page
    .getByRole('dialog', { name: 'Leave signing?' })
    .getByRole('link', { name: 'Leave to overview' })
    .click();

  const readyProposal = page.getByRole('link', {
    name: 'Resume payment, Overview resume test, 2 of 2 signatures collected'
  });
  await expect(readyProposal).toContainText('Payment ready to broadcast');
  await readyProposal.click();
  await expect(page.getByRole('button', { name: 'Finalize & broadcast' })).toBeVisible();

  const discardButton = page.getByRole('button', { name: /Discard .* local signature/ }).first();
  await discardButton.click();
  const discardDialog = page.getByRole('dialog', { name: 'Discard local signature?' });
  await expect(discardDialog.getByText('This does not revoke the signature.')).toBeVisible();
  await expect(
    discardDialog.getByText('Any PSBT copy already exported or shared may still contain it')
  ).toBeVisible();
  await expect(discardDialog.getByText('2 of 2 → 1 of 2')).toBeVisible();
  await discardDialog.getByRole('button', { name: 'Keep signature' }).click();
  await expect(page.getByRole('button', { name: 'Finalize & broadcast' })).toBeVisible();

  await discardButton.click();
  await discardDialog.getByRole('button', { name: 'Discard local signature' }).click();
  await expect(page.getByText('Local signature discarded', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Payment signers' }).getByText('1 of 2 collected')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalize & broadcast' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to overview' }).click();
  await page
    .getByRole('dialog', { name: 'Leave signing?' })
    .getByRole('link', { name: 'Leave to overview' })
    .click();
  await expect(
    page.getByRole('link', {
      name: 'Resume payment, Overview resume test, 1 of 2 signatures collected'
    })
  ).toContainText('Signing in progress');
});

test('keeps advanced wallet actions compact and makes both descriptors inspectable', async ({
  page
}) => {
  await page.goto('/multisig');
  await page.getByRole('button', { name: 'More wallet actions' }).click();
  await expect(page.getByRole('menuitem', { name: /Show descriptors/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Export & verify/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Recovery policy lab/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Recovery policy lab' })).toHaveCount(0);
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

test('shows signer details and runs honest health checks', async ({ page }) => {
  await page.goto('/multisig');

  await expect(page.locator('.saved-cosigner-list article')).toHaveCount(3);
  await expect(page.locator('.signer-readiness-list')).toHaveCount(0);

  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  const coldcardDialog = page.getByRole('dialog', { name: 'Coldcard' });
  await expect(coldcardDialog).toBeVisible();
  await expect(coldcardDialog.getByText('f00dbabe', { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText("m/48'/1'/0'/2'", { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText('Wallet policy', { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByText('Setup not recorded', { exact: true })).toBeVisible();
  await expect(coldcardDialog.getByRole('button', { name: 'Review setup' })).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'View public account key (xpub)' }).click();
  const xpubDialog = page.getByRole('dialog', { name: 'Coldcard public account key (xpub)' });
  await expect(
    xpubDialog.getByRole('button', { name: 'Copy exact Public account key (xpub)' })
  ).toBeVisible();
  await xpubDialog.getByRole('button', { name: 'Close' }).click();
  await expect(coldcardDialog.getByText('Not checked yet', { exact: true })).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'Check signer' }).click();
  await expect(coldcardDialog.getByRole('status', { name: 'Checking signer' })).toContainText(
    'Checking signer'
  );
  await expect(
    coldcardDialog.locator('.health-card').getByText('Signer matches this wallet.')
  ).toBeVisible();
  await expect(coldcardDialog.locator('.health-heading strong')).toHaveCSS('font-size', '13px');
  await expect(coldcardDialog.getByText(/Last checked/)).toBeVisible();
  await coldcardDialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'View Offline backup details' }).click();
  const backupDialog = page.getByRole('dialog', { name: 'Offline backup' });
  await expect(backupDialog.getByText('Signer check', { exact: true })).toBeVisible();
  await backupDialog.getByRole('button', { name: 'Check signer' }).click();
  await expect(
    backupDialog.getByText('This signer has no interactive USB device type.')
  ).toBeVisible();
  await backupDialog.getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await page.getByRole('button', { name: 'View Coldcard details' }).click();
  const restoredHealth = page.getByRole('dialog', { name: 'Coldcard' });
  await expect(restoredHealth.getByText('Not checked yet', { exact: true })).toBeVisible();
});

test('uses the same wallet navigation for a multisig policy', async ({ page }) => {
  const isMobile = (page.viewportSize()?.width ?? 1180) <= 760;
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page
      .locator('.wallet-manager')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  } else {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  const navigation =
    (page.viewportSize()?.width ?? 1180) <= 760
      ? page.locator('.mobile-nav')
      : page.getByRole('complementary');
  await expect(navigation.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Activity' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Coins' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Policy', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Policy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  await navigation.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('2,481,240')).toBeVisible();
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
    const [walletTriggerBox, walletMenuBox] = await Promise.all([
      walletTrigger.boundingBox(),
      walletMenu.boundingBox()
    ]);
    expect(walletTriggerBox).not.toBeNull();
    expect(walletMenuBox).not.toBeNull();
    expect(
      (walletMenuBox?.y ?? 0) - ((walletTriggerBox?.y ?? 0) + (walletTriggerBox?.height ?? 0))
    ).toBeGreaterThanOrEqual(7);
    expect(
      (walletMenuBox?.y ?? 0) - ((walletTriggerBox?.y ?? 0) + (walletTriggerBox?.height ?? 0))
    ).toBeLessThanOrEqual(9);
    expect(Math.abs((walletMenuBox?.x ?? 0) - (walletTriggerBox?.x ?? 0))).toBeLessThanOrEqual(1);
    await walletTrigger.click();
  } else {
    const receive = page
      .locator('.primary-actions .overview-inline-primary')
      .filter({ hasText: 'Receive' });
    const send = page
      .locator('.primary-actions .overview-inline-primary')
      .filter({ hasText: 'Send' });
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
  await expect(moreMenu.getByRole('menuitem')).toHaveCount(5);
  await expect(moreMenu.getByRole('menuitem', { name: /Activity/ })).toBeVisible();
  await expect(moreMenu.getByRole('menuitem', { name: /Coins/ })).toBeVisible();
  await expect(moreMenu.getByRole('menuitem', { name: /Policy/ })).toBeVisible();
  await expect(moreMenu.getByRole('menuitem', { name: /Show descriptors/ })).toBeVisible();
  await expect(moreMenu.getByRole('menuitem', { name: /Export & verify/ })).toHaveAttribute(
    'href',
    '/multisig/backup'
  );
  await expect(moreMenu.getByRole('menuitem', { name: /Recovery policy lab/ })).toHaveCount(0);
  if (isMobile) {
    await page.waitForTimeout(180);
    const [moreTriggerBox, moreMenuBox] = await Promise.all([
      moreActions.boundingBox(),
      moreMenu.boundingBox()
    ]);
    expect(moreTriggerBox).not.toBeNull();
    expect(moreMenuBox).not.toBeNull();
    expect(
      (moreMenuBox?.y ?? 0) - ((moreTriggerBox?.y ?? 0) + (moreTriggerBox?.height ?? 0))
    ).toBeGreaterThanOrEqual(7);
    expect(
      (moreMenuBox?.y ?? 0) - ((moreTriggerBox?.y ?? 0) + (moreTriggerBox?.height ?? 0))
    ).toBeLessThanOrEqual(9);
    expect(
      Math.abs(
        (moreMenuBox?.x ?? 0) +
          (moreMenuBox?.width ?? 0) -
          ((moreTriggerBox?.x ?? 0) + (moreTriggerBox?.width ?? 0))
      )
    ).toBeLessThanOrEqual(1);
  }
  await moreMenu.getByRole('menuitem', { name: /Show descriptors/ }).click();
  const overviewDescriptors = page.getByRole('dialog', { name: 'Wallet descriptors' });
  await expect(
    overviewDescriptors.getByText('Portable wallet descriptor', { exact: true })
  ).toBeVisible();
  await expect(
    overviewDescriptors.getByRole('button', { name: 'Copy wallet descriptor' })
  ).toBeVisible();
  await overviewDescriptors.getByRole('button', { name: 'Close' }).click();
  await moreActions.click();
  // The upward-opening desktop menu may cover the heading. Verify a genuinely
  // outside point instead of asking Playwright to click through the menu.
  const outside = { x: (page.viewportSize()?.width ?? 1180) - 8, y: 8 };
  const menuBounds = await moreMenu.boundingBox();
  expect(menuBounds).not.toBeNull();
  expect(
    menuBounds &&
      outside.x >= menuBounds.x &&
      outside.x <= menuBounds.x + menuBounds.width &&
      outside.y >= menuBounds.y &&
      outside.y <= menuBounds.y + menuBounds.height
  ).toBe(false);
  await page.mouse.click(outside.x, outside.y);
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
    await page
      .locator('.wallet-manager')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  } else {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /Family wallet/ })
      .click();
  }
  await page.getByLabel('App PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await page.getByRole('link', { name: 'Coins' }).click();

  const coin = page.getByRole('checkbox', { name: 'Select Savings', exact: true });
  await coin.check();
  await expect(page.locator('.coin-toolbar')).toContainText('1,250,000 sats selected');
  await page.getByRole('button', { name: 'More actions for selected coin' }).click();
  await page.getByRole('menuitem', { name: /Freeze selected/ }).click();
  await page
    .getByRole('dialog', { name: 'Freeze Savings?' })
    .getByRole('button', { name: 'Freeze coin' })
    .click();
  await expect(page.getByRole('button', { name: 'Unfreeze Savings' })).toBeVisible();
  await page.getByRole('button', { name: 'Unfreeze Savings' }).click();
  await page
    .getByRole('dialog', { name: 'Unfreeze Savings?' })
    .getByRole('button', { name: 'Unfreeze coin' })
    .click();
  await coin.check();
  await page.getByRole('checkbox', { name: 'Select Savings, Refund', exact: true }).check();
  await page.getByRole('link', { name: 'Send selected coins' }).click();
  await expect(page).toHaveURL(/\/multisig\/send\?coins=/);
  await page.getByLabel('Payment label').fill('Vault coin selection');
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await expect(page.getByText('Manual · 2 coins')).toBeVisible();
  const selectionPreview = page.locator('.manual-selection-preview');
  await expect(selectionPreview).toContainText('2 selected · 1,639,090 sats');
  await expect(selectionPreview.locator('.selection-technical > span')).toBeHidden();
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
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('2479707');
  await expect(page.locator('.max-spend-guidance')).toContainText(
    'Maximum spendable amount selected'
  );
  await expect(
    page.locator('.toast').filter({ hasText: 'Maximum spendable amount selected' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
  await page.getByRole('button', { name: 'Custom' }).click();
  await page.getByLabel('Custom fee rate').fill('8');
  await page.getByLabel('Custom fee rate').fill('2');
  await page.getByLabel('Custom fee rate').fill('3');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeDisabled();
  await expect(page.locator('.available-balance-summary[role="status"]')).toContainText(
    'Updating the maximum spendable amount for this fee'
  );
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('2480583');
  await expect(page.getByText('Estimated fee 657 sats')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
});

test('offers safe recipes and advanced M-of-N control', async ({ page }, testInfo) => {
  await page.goto('/multisig/new');
  await expect(page.getByRole('heading', { name: 'Choose how this wallet spends' })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme
    );
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath(`setup-choice-${theme}.png`)
    });
  }
  await expect(page.getByLabel('Wallet name')).toHaveCount(0);
  await expect(page.getByText(/same four-key structure/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  for (const card of await page.locator('.policy-kind-card').all()) {
    expect(
      Number.parseFloat(
        await card.locator('strong').evaluate((node) => getComputedStyle(node).fontSize)
      )
    ).toBeGreaterThanOrEqual(15);
  }
  for (const plan of ['Standard', 'Recovery']) {
    await page.getByRole('button', { name: new RegExp(`^${plan}`) }).click();
    const selectedMark = page.locator('.policy-kind-card.active .policy-kind-check svg');
    await expect(selectedMark).toBeVisible();
    await expect(selectedMark).toHaveCSS('stroke', 'rgb(255, 255, 255)');
  }
  const assistedRecovery = page.getByRole('button', { name: /^Assisted recovery/ });
  await expect(assistedRecovery).toBeDisabled();
  await expect(assistedRecovery).toContainText('Coming soon');
  await page.getByRole('button', { name: /^Standard/ }).click();
  await revealInsight(page, 'How Standard multisig works', testInfo.project.name === 'mobile');
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'No single key can spend alone' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Standard multisig' })).toBeVisible();
  await expect(page.getByText('2 of 3', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Assisted signing', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /3 of 5/ }).click();
  await expect(page.locator('.policy-pill')).toHaveText('3 of 5');
  await page.getByRole('button', { name: /Custom/ }).click();
  await page.getByLabel('Total signers').selectOption('4');
  await page.getByLabel('Signatures required').selectOption('3');
  await expect(page.locator('.policy-pill')).toHaveText('3 of 4');
  await expect(page.getByLabel('Signatures required').locator('option[value="1"]')).toHaveCount(0);
  await expect(page.getByText('Multisig requires at least two signatures.')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme
    );
    await page.screenshot({
      path: test.info().outputPath(`setup-custom-${theme}.png`),
      animations: 'disabled',
      fullPage: true
    });
  }
  await continueToSigners(page, 'Advanced policy vault');
  await expect(page.getByText('Advanced policy vault · 3 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Back to policy' }).click();
  await expect(page.getByRole('heading', { name: 'Standard multisig' })).toBeVisible();
  await expect(page.getByLabel('Wallet name')).toHaveValue('Advanced policy vault');
  await expect(page.getByLabel('Total signers')).toHaveValue('4');
  await expect(page.getByLabel('Signatures required')).toHaveValue('3');
});

test('saves the empty signer step and exits after discarding setup', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Fresh multisig setup');

  await expect(page.getByText('No signers yet', { exact: true })).toBeVisible();
  await expect(page.getByText('Setup progress is not safely saved.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard setup' }).click();
  await page
    .getByRole('dialog', { name: 'Discard multisig setup?' })
    .getByRole('button', { name: 'Discard setup' })
    .click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create a multisig wallet' })).toHaveCount(0);
});

test('explains hardware readiness before scanning', async ({ page }) => {
  await page.goto('/multisig/new');
  await expect(page.getByRole('button', { name: 'Hardware setup help' })).toHaveCount(0);
  await continueToSigners(page, 'Hardware help vault');
  await page.getByRole('button', { name: 'Hardware setup help' }).click();
  const help = page.getByRole('dialog', { name: 'Prepare your hardware signer' });
  await expect(help).toBeVisible();
  await expect(
    help.getByText('It must be initialized, unlocked, and have its recovery backup saved.')
  ).toBeVisible();
  await help.getByRole('button', { name: 'Ledger' }).click();
  await expect(help.getByText(/Nano S Plus/)).toBeVisible();
  await expect(help.getByText(/open Bitcoin(?: Test)?/)).toBeVisible();
  await help.getByRole('button', { name: 'BitBox02' }).click();
  await expect(help.getByText(/Connect and unlock BitBox/)).toBeVisible();
  await expect(help.getByText(/Quit BitBoxApp/)).toBeVisible();
  await help.getByRole('button', { name: 'Trezor' }).click();
  await expect(help.getByText('Model One', { exact: true })).toBeVisible();
  await expect(help.getByText('Safe 3 Bitcoin-only', { exact: true })).toBeVisible();
  await expect(help.getByText(/Quit Trezor Suite, connect, and unlock/)).toBeVisible();
  await expect(help.getByText(/complete Groot’s PIN matrix/)).toBeVisible();
  await expect(
    help.getByText('It must be initialized, unlocked, and have its recovery backup saved.')
  ).toBeVisible();
  await help.getByRole('button', { name: 'Scan for devices' }).click();
  const scan = page.getByRole('dialog', { name: 'Connect hardware device' });
  await expect(scan.getByText('Keep USB free', { exact: true })).toBeVisible();
  await expect(scan.getByText(/Use a cable and quit other wallet apps/)).toBeVisible();
  expect(await scan.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(
    await scan
      .locator('.hardware-device-list')
      .evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
  await expect(scan.getByRole('button', { name: /Scan again/ })).toBeVisible();
  const modalBody = scan.locator('.modal-body');
  expect(await modalBody.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  const modalCanScroll = await modalBody.evaluate(
    (element) => element.scrollHeight > element.clientHeight
  );
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
  await expect(scan.getByText('Locked', { exact: true })).toBeVisible();
  await expect(scan.getByText(/Start the PIN matrix/)).toHaveCount(0);
  await scan.getByRole('button', { name: /Virtual Trezor One/ }).click();

  const pin = page.getByRole('dialog', { name: 'Unlock Trezor' });
  await expect(scan).toBeHidden();
  await expect(page.getByText('Scanning all USB hardware signers…')).toHaveCount(0);
  await expect(
    pin.getByText('For each PIN digit on Trezor, tap the blank cell in the same location.')
  ).toBeVisible();
  await expect(pin.getByText(/receives positions, never your PIN digits/)).toHaveCount(0);
  await expect(pin.getByText(/grid deliberately stays blank/)).toHaveCount(0);
  await pin.getByRole('button', { name: 'Close' }).click();
  await expect(pin).toHaveClass(/modal-attention/);
  await expect(pin).not.toHaveClass(/modal-attention/);
  await expect(pin.getByRole('status', { name: 'Trezor disconnection required' })).toBeVisible();
  await pin.getByRole('button', { name: 'Continue PIN entry' }).click();
  await expect(pin.getByRole('button', { name: 'Top left position' })).toBeVisible();
  await pin.locator('..').dispatchEvent('click');
  await expect(pin).toHaveClass(/modal-attention/);
  await expect(pin).not.toHaveClass(/modal-attention/);
  await expect(pin.getByText('Disconnect Trezor')).toBeVisible();
  await pin.getByRole('button', { name: 'Continue PIN entry' }).click();
  await expect(pin.getByRole('button', { name: 'Top left position' })).toBeVisible();
  await pin.focus();
  await page.keyboard.press('Escape');
  await expect(pin).toHaveClass(/modal-attention/);
  await pin.getByRole('button', { name: 'Continue PIN entry' }).click();
  await expect(pin.getByRole('button', { name: 'Top left position' })).toHaveText('');
  await pin.getByRole('button', { name: 'Top left position' }).click();
  await pin.getByRole('button', { name: 'Bottom left position' }).click();
  await pin.getByRole('button', { name: 'Top right position' }).click();
  await expect(pin.getByLabel('3 PIN positions selected')).toHaveText('•••');
  await pin.getByRole('button', { name: 'Unlock Trezor' }).click();
  await expect(pin.getByRole('status', { name: 'Trezor unlock in progress' })).toContainText(
    'Waiting for Trezor'
  );
  await expect(page.getByText('Hardware signer unlocked')).toBeVisible();
  const standard = page.getByRole('dialog', { name: 'Use Trezor standard wallet?' });
  await expect(standard).toBeVisible();
  await standard.getByRole('button', { name: 'Use standard wallet' }).click();
  await expect(page.getByRole('button', { name: 'View Virtual Trezor One details' })).toBeVisible();
  await expect(page.getByText('c0ffee03', { exact: true })).toBeVisible();
});

test('explicitly selects a Trezor standard wallet without changing hidden wallets', async ({
  page
}) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Trezor standard vault');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Connect hardware device' }).click();
  const scan = page.getByRole('dialog', { name: 'Connect hardware device' });
  const standard = scan.getByRole('button', { name: /Virtual Trezor Standard/ });
  await expect(standard.getByText('Choose wallet')).toBeVisible();
  await standard.click();

  const choice = page.getByRole('dialog', { name: 'Use Trezor standard wallet?' });
  await expect(choice).toContainText(
    /It does not disable, change, or\s+reveal any hidden passphrase wallet/
  );
  await choice.getByRole('button', { name: 'Use standard wallet' }).click();
  await expect(
    choice.getByRole('status', { name: 'Hardware signer import in progress' })
  ).toContainText('Importing the Trezor standard wallet');
  await expect(
    page.getByRole('button', { name: 'View Virtual Trezor Standard details' })
  ).toBeVisible();
  await expect(page.getByText('c0ffee02', { exact: true }).first()).toBeVisible();
});

test('imports a bounded public signer record from a mounted-file flow', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Offline import vault');
  await page.getByRole('button', { name: 'Add a signer' }).click();

  await page.getByLabel('Public signer file').setInputFiles({
    name: 'coldcard-mainnet.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        xfp: 'F00DBABE',
        p2wsh: 'xpub-mainnet-account-key',
        p2wsh_deriv: "m/48'/0'/0'/2'"
      })
    )
  });
  const importWarning = page.getByRole('alert');
  await expect(importWarning).toContainText('Could not import this signer');
  await expect(importWarning).toContainText('This Coldcard export is for Bitcoin mainnet.');
  await expect(importWarning).toContainText('Testnet Mode → Regtest');

  await page.getByLabel('Public signer file').setInputFiles({
    name: 'coldcard-regtest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        label: 'SD signer',
        xpub: 'xpub-generic-master-key-that-must-not-be-selected',
        p2wsh: 'Vpub-slip132-key-that-must-not-be-selected',
        p2wsh_deriv: 'm/48h/1h/0h/2h',
        p2wsh_desc:
          'wsh(sortedmulti(M,[F00DBABE/48h/1h/0h/2h]tpubD6NzVbkrYhZ4Y-fixture-coldcard-public-key/0/*,...))'
      })
    )
  });
  await expect(page.getByText('Public signer imported')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View SD signer details' })).toBeVisible();
  await page.getByRole('button', { name: 'View SD signer details' }).click();
  const details = page.getByRole('dialog', { name: 'SD signer' });
  await expect(details.getByRole('definition').filter({ hasText: 'File import' })).toBeVisible();
  await details.getByRole('button', { name: 'Edit name' }).click();
  await details.getByLabel('Signer name').fill('Air-gapped Coldcard');
  await details.getByRole('button', { name: 'Save name' }).click();
  const renamedDetails = page.getByRole('dialog', { name: 'Air-gapped Coldcard' });
  await expect(renamedDetails).toBeVisible();
  await expect(renamedDetails.getByText('Signer check', { exact: true })).toBeVisible();
  await expect(renamedDetails.getByText('Not checked yet')).toBeVisible();
  await renamedDetails.getByRole('button', { name: 'Check signer' }).click();
  await expect(renamedDetails.getByText('Signer matches this wallet.')).toBeVisible();
  await expect(
    page.getByText('Air-gapped Coldcard matches this wallet.', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(
    page.getByRole('button', { name: 'View Air-gapped Coldcard details' })
  ).toBeVisible();
});

test('marks an already-added connected signer and prevents selecting it again', async ({
  page
}) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Connected duplicate test');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Connect hardware device' }).click();
  await page
    .getByRole('dialog', { name: 'Connect hardware device' })
    .getByRole('button', { name: /Virtual Coldcard/ })
    .click();

  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Connect hardware device' }).click();
  const alreadyAdded = page
    .getByRole('dialog', { name: 'Connect hardware device' })
    .getByRole('button', { name: /Virtual Coldcard/ });
  await expect(alreadyAdded).toContainText('Already added');
  await expect(alreadyAdded).toContainText('Already added as Virtual Coldcard');
  await expect(alreadyAdded).toBeDisabled();
});

test('opens and checks an imported hardware signer during setup', async ({ page }) => {
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
  await expect(cardRow).toHaveCSS('box-shadow', /rgb\(27, 86, 197\)/);
  const rowBounds = await cardRow.boundingBox();
  const detailsBounds = await signerCard.boundingBox();
  const removeBounds = await page
    .getByRole('button', { name: 'Remove Virtual Coldcard' })
    .boundingBox();
  expect(rowBounds && detailsBounds && removeBounds).toBeTruthy();
  expect(rowBounds!.x + rowBounds!.width).toBeGreaterThan(detailsBounds!.x + detailsBounds!.width);
  expect(removeBounds!.x + removeBounds!.width).toBeLessThanOrEqual(
    rowBounds!.x + rowBounds!.width
  );
  await signerCard.click();
  const details = page.getByRole('dialog', { name: 'Virtual Coldcard' });
  await expect(details.getByText('Not checked yet')).toBeVisible();
  await details.getByRole('button', { name: 'Check signer' }).click();
  await expect(
    details.locator('.health-card').getByText('Signer matches this wallet.')
  ).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Create a multisig wallet' })).toBeVisible();
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
  await expect(
    page.getByRole('heading', { name: 'Family vault Review', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descriptor logic' })).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme
    );
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath(`setup-review-${theme}.png`)
    });
  }
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  await expect(page.getByRole('heading', { name: 'Back up Family vault Wallet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to verification' })).toHaveCount(1);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme
    );
    await page.screenshot({
      path: test.info().outputPath(`setup-backup-${theme}.png`),
      animations: 'disabled',
      fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
  await revealInsight(
    page,
    'About wallet descriptors',
    (page.viewportSize()?.width ?? 1180) <= 760
  );
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
  const creationProgress = page.getByRole('navigation', { name: 'Wallet creation progress' });
  await expect(creationProgress.locator('li.complete')).toHaveCount(3);
  await expect(creationProgress.locator('li.complete svg')).toHaveCount(3);
  await expect(creationProgress.locator('li.current')).toContainText('Back up');
  await expect(page.getByRole('heading', { name: 'Save the wallet descriptor' })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.locator('.setup-task.complete')).toContainText('View completed step');
  await expect(page.locator('.setup-task.current')).toContainText(
    'Register the policy on Coldcard'
  );
  await page.getByLabel('Policy verified on every Coldcard').check();
  const verifyLedgerPolicy = page
    .locator('.signer-readiness-list article')
    .filter({ hasText: 'Ledger' })
    .getByRole('button', { name: 'Verify policy' });
  await verifyLedgerPolicy.click();
  const policyDialog = page.getByRole('dialog', { name: 'Verify wallet policy' });
  await expect(policyDialog.getByText('Signer keys to compare', { exact: true })).toBeVisible();
  await policyDialog.getByRole('button', { name: 'Review on Ledger' }).click();
  await expect(
    policyDialog.getByText('This signer has no interactive USB device type.', { exact: true })
  ).toBeVisible();
  await expect
    .poll(async () =>
      policyDialog.evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= innerHeight;
      })
    )
    .toBe(true);
  const policyDialogBounds = await policyDialog.boundingBox();
  const viewport = page.viewportSize();
  expect(policyDialogBounds && viewport).toBeTruthy();
  expect(policyDialogBounds!.y).toBeGreaterThanOrEqual(0);
  expect(policyDialogBounds!.y + policyDialogBounds!.height).toBeLessThanOrEqual(viewport!.height);
  if (viewport!.width > 760) {
    expect(
      Math.abs(policyDialogBounds!.y + policyDialogBounds!.height / 2 - viewport!.height / 2)
    ).toBeLessThanOrEqual(8);
  }
  await policyDialog.getByRole('button', { name: 'Close' }).click();
  await expect(policyDialog).toBeHidden();
  await page
    .locator('.setup-task')
    .filter({ hasText: 'Verify hardware signer policies' })
    .getByRole('button', { name: /Finish hardware setup before first signature/ })
    .click();
  await expect(page.locator('.setup-task.current')).toContainText('Set the coordinator PIN');
  await expect(page.getByRole('heading', { name: 'Set the coordinator PIN' })).toBeVisible();
  await page.getByLabel('App PIN', { exact: true }).fill('coordinator-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();

  await expect(page).toHaveURL(/\/multisig$/);
  await expect(page.getByRole('heading', { name: 'Family vault' })).toBeVisible();
  await expect(page.locator('.vault-policy-tags').getByText('2 of 3 keys')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Receive' }).click();
  await expect(page.getByRole('heading', { name: 'Receive bitcoin' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code for/ })).toBeVisible();
  await page.getByRole('button', { name: 'New receive address' }).click();
  const receiveDialog = page.getByRole('dialog', { name: 'New receive address' });
  await receiveDialog.getByLabel('Label', { exact: true }).fill('Vault deposit test');
  await receiveDialog.getByRole('button', { name: 'Generate address' }).click();
  await expect(
    page.locator('.receive-card').getByText('Vault deposit test', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('Receive address ready')).toBeVisible();
  await page.getByRole('button', { name: 'New receive address' }).click();
  await expect(page.getByRole('button', { name: 'Reuse Vault deposit test' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page
    .locator('a:visible')
    .filter({ hasText: /^Overview$/ })
    .click();
  await page
    .locator('a:visible')
    .filter({ hasText: /^Send$/ })
    .click();
  await page.getByLabel('Bitcoin address').fill('bcrt1qvaultdestination0000000000000000000000000');
  await page.getByLabel('Payment label').fill('Vault test payment');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('50000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  const paymentSigners = page.getByRole('region', { name: 'Payment signers' });
  await expect(paymentSigners.getByText('0 of 2 collected')).toBeVisible();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  const firstSigningDialog = page.getByRole('dialog', { name: 'Sign with hardware' });
  await firstSigningDialog.getByRole('button', { name: /^Ledger / }).click();
  const signingPolicyReview = page.getByRole('dialog', { name: 'Review wallet policy' });
  await expect(signingPolicyReview.getByText('Reject if any value differs on Ledger.')).toHaveCount(
    0
  );
  await expect(
    signingPolicyReview.getByText('Signer keys to compare', { exact: true })
  ).toBeVisible();
  await expect(signingPolicyReview).not.toContainText(
    'current Ledger connection must authorize this policy again'
  );
  await expect(signingPolicyReview).not.toContainText('Do not fund this address directly');
  await expect(signingPolicyReview).not.toContainText('Verification only.');
  await expect(signingPolicyReview).toHaveCSS('opacity', '1');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: test.info().outputPath(`policy-review-${theme}.png`) });
  }
  await expect(signingPolicyReview).toBeInViewport();
  expect(
    await signingPolicyReview.evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    })
  ).toBe(true);
  if ((page.viewportSize()?.width ?? 1180) > 760) {
    await page.setViewportSize({ width: 1728, height: 1117 });
    await expect(signingPolicyReview).toBeInViewport();
    expect(
      await signingPolicyReview.evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      })
    ).toBe(true);
  }
  await expect(
    signingPolicyReview.getByLabel('I compared the threshold and every signer key')
  ).toHaveCount(0);
  await signingPolicyReview.getByRole('button', { name: 'Review on Ledger' }).click();
  await expect(signingPolicyReview.getByText('Policy reference saved in Groot')).toBeVisible();
  await signingPolicyReview.getByRole('button', { name: 'Review & sign on Ledger' }).click();
  await signingPolicyReview
    .getByRole('button', { name: 'Wallet policy reviewed — show transaction' })
    .click();
  await expect(signingPolicyReview).toBeHidden();
  await expect(paymentSigners.getByText('1 of 2 collected')).toBeVisible();
  await page.getByRole('button', { name: 'Sign with device' }).click();
  await page
    .getByRole('dialog', { name: 'Sign with hardware' })
    .getByRole('button', { name: /^Coldcard / })
    .click();
  await expect(page.getByRole('dialog', { name: 'Prepare Coldcard for this wallet' })).toHaveCount(
    0
  );
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
  await expect(
    exportCard.getByText(/Groot JSON includes public descriptors and wallet metadata/)
  ).toBeVisible();
  await page.getByLabel('Backup app PIN', { exact: true }).fill('wrong-pin');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  await expect(exportCard.getByText('That app PIN does not match Family vault.')).toBeVisible();
  await expect(page.getByText('That app PIN does not match Family vault.')).toHaveCount(1);
  await page.getByLabel('Backup app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(
    /"network": "regtest"/
  );
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
  expect(
    await printSheet
      .locator('.print-descriptors')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  ).toBe(1);
  for (const qr of await printSheet.locator('.print-descriptors img').all()) {
    expect(
      await qr.evaluate((element) => element.getBoundingClientRect().width)
    ).toBeGreaterThanOrEqual(180);
  }
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => {
    window.print = () => document.documentElement.setAttribute('data-print-called', 'true');
  });
  await page.getByRole('button', { name: 'Save PDF' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-called', 'true');
  await page.getByLabel('Backup file import').setInputFiles({
    name: 'family-vault-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(descriptorBackup)
  });
  await expect(page.locator('.file-action.file-loaded')).toBeVisible();
  await expect(
    page.getByText('Use a BSMS or JSON backup. PDF cannot be imported or tested.')
  ).toBeVisible();
  expect(
    await page
      .locator('.file-action.file-loaded')
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingTop))
  ).toBeGreaterThanOrEqual(12);
  await expect(
    page.locator('.file-action').getByText('family-vault-backup.json', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Test recovery' }).click();
  await expect(page.getByText('Backup verified')).toBeVisible();
  await page.getByRole('link', { name: 'Continue to wallet deletion' }).click();
  await expect(page).toHaveURL(/\/multisig\/delete$/);
  await expect(page.getByRole('heading', { name: 'Delete multisig wallet' })).toBeVisible();
  await expect(page.getByText('Recovery tested')).toBeVisible();
  await expect(
    page.locator('label.field').filter({ has: page.getByLabel('Wallet name confirmation') })
  ).toContainText('Type');
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
  const reopenedDeleteDialog = page.getByRole('dialog', {
    name: 'Permanently delete this wallet?'
  });
  await expect(reopenedDeleteDialog).toBeVisible();
  await reopenedDeleteDialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(
    page.locator('.danger-card').getByText('That app PIN does not match Family vault.')
  ).toBeVisible();
  await page.getByLabel('Delete wallet app PIN', { exact: true }).fill('coordinator-pin');
  await page.getByRole('button', { name: 'Delete wallet from this device' }).click();
  await page
    .getByRole('dialog', { name: 'Permanently delete this wallet?' })
    .getByRole('button', { name: 'Delete permanently' })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  if ((page.viewportSize()?.width ?? 1180) <= 760) {
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
  await page.getByRole('button', { name: /Multisig wallet/ }).click();
  await page.getByRole('link', { name: /Recover from backup/ }).click();
  const publicDescriptor = JSON.parse(descriptorBackup).wallet.externalDescriptor as string;
  await page.getByLabel('Choose recovery backup file').setInputFiles({
    name: 'coldcard-multisig.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`# Public multisig policy\n${publicDescriptor}\n`)
  });
  await expect(page.getByLabel('Recovery descriptor backup')).toHaveValue(/Public multisig policy/);
  await page.getByRole('button', { name: 'Validate backup' }).click();
  await expect(page.getByText('Backup is valid')).toBeVisible();
  await expect(page.getByLabel('Recovered wallet name')).toBeVisible();
  await page.getByLabel('Choose recovery backup file').setInputFiles({
    name: 'family-vault-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(descriptorBackup)
  });
  const backupFilePicker = page.getByLabel('Choose recovery backup file').locator('..');
  await expect(
    backupFilePicker.getByText('family-vault-backup.json', { exact: true })
  ).toBeVisible();
  await expect(backupFilePicker.getByText('Backup file ready', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Recovery descriptor backup')).toHaveValue(descriptorBackup);
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
  await expect(page.getByText(/BSMS is an unencrypted public descriptor/)).toBeVisible();
  await page.getByRole('button', { name: /Groot JSON/ }).click();
  await expect(page.getByText(/Groot JSON includes public descriptors/)).toBeVisible();
  await expect(page.getByText(/BSMS is an unencrypted public descriptor/)).toHaveCount(0);
  await page.getByRole('button', { name: /BSMS 1\.0/ }).click();
  await page.getByLabel('Backup app PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(/^BSMS 1\.0\n/);
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(
    /\/0\/\*,\/1\/\*/
  );
  const bsms = await page.getByLabel('Descriptor backup', { exact: true }).inputValue();
  await page.getByRole('button', { name: /Groot JSON/ }).click();
  await expect(page.getByLabel('Backup app PIN')).toHaveCount(0);
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(
    /"network": "regtest"/
  );
  const json = await page.getByLabel('Descriptor backup', { exact: true }).inputValue();
  expect(json).not.toBe(bsms);
  await page.getByRole('button', { name: /BSMS 1\.0/ }).click();
  await expect(page.getByLabel('Descriptor backup', { exact: true })).toHaveValue(bsms);
  await page.getByRole('button', { name: 'Enlarge receive descriptor QR' }).click();
  const qrDialog = page.getByRole('dialog', { name: 'Receive descriptor QR' });
  await expect(qrDialog.getByAltText('Large QR code for the receive descriptor')).toBeVisible();
  await qrDialog.getByRole('button', { name: 'Close' }).click();
  await expect(qrDialog).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download BSMS' }).click();
  await expect((await downloadPromise).suggestedFilename()).toBe('family-wallet.bsms');
  await page.getByLabel('Backup file import').setInputFiles({
    name: 'family-wallet.bsms',
    mimeType: 'text/plain',
    buffer: Buffer.from(bsms)
  });
  const loadedFile = page.locator('.file-action.file-loaded');
  await expect(loadedFile).toContainText('Backup ready');
  expect(
    await loadedFile.evaluate((element) => parseFloat(getComputedStyle(element).paddingTop))
  ).toBeGreaterThanOrEqual(12);
  await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0, {
    timeout: 10_000
  });
  await loadedFile.scrollIntoViewIfNeeded();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme
    );
    await page.screenshot({
      path: `/private/tmp/groot-backup-${page.viewportSize()?.width}-${theme}.png`,
      animations: 'disabled'
    });
  }
  await page.getByRole('button', { name: 'Test recovery' }).click();
  await expect(page.getByText('Backup verified')).toBeVisible();
});

test('policy navigation never shows a single-key fallback before loading multisig', async ({
  page
}) => {
  await page.addInitScript(() => {
    const flashes: string[] = [];
    (window as typeof window & { policyFallbackFlashes: string[] }).policyFallbackFlashes = flashes;
    new MutationObserver(() => {
      if (document.body?.textContent?.includes('Single-key policy')) flashes.push('single-key');
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto('/multisig');
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { policyFallbackFlashes: string[] }).policyFallbackFlashes
    )
  ).toEqual([]);
  await expect(page.getByRole('link', { name: 'Recovery policy lab' })).toHaveCount(0);
});

test('shows one authoritative failure when a BSMS record belongs to another wallet', async ({
  page
}) => {
  await page.goto('/multisig/backup');
  await page.getByLabel('Backup app PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  const exported = await page.getByLabel('Descriptor backup', { exact: true }).inputValue();
  const mismatched = exported.replace('/**', '/9/**');
  await page.getByLabel('Backup file import').setInputFiles({
    name: 'different-wallet.bsms',
    mimeType: 'text/plain',
    buffer: Buffer.from(mismatched)
  });
  await expect(
    page.locator('.file-action').getByText('different-wallet.bsms', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Test recovery' }).click();
  await expect(
    page.locator('.drill-result').getByText('Backup does not match', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('Recovery test passed', { exact: true })).toHaveCount(0);
  await page.goto('/multisig/delete');
  await expect(page.getByText('Recovery test required', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export wallet backup' })).toHaveAttribute(
    'href',
    '/multisig/backup'
  );
  await expect(page.getByRole('button', { name: 'Delete wallet from this device' })).toBeDisabled();
});

test('reveals draft errors only after review and keeps signer identity readable', async ({
  page
}) => {
  await page.goto('/multisig/new');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
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
  await expect(details.getByText('Not checked yet')).toBeVisible();
  await details.getByRole('button', { name: 'Check signer' }).click();
  await expect(details.getByText('This signer has no interactive USB device type.')).toBeVisible();
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

test('gates and simulates guided Miniscript recovery policies', async ({ page }) => {
  await page.goto('/multisig');
  await expect(page.getByRole('link', { name: 'Recovery policy lab' })).toHaveCount(0);
  await page.goto('/multisig/policy');
  await expect(page).toHaveURL(/\/multisig$/);

  await page.goto('/multisig/policy?fixture-policy-maturity=1');
  await expect(page.getByText('Experimental analysis only')).toBeVisible();
  await expect(page.getByText(/Analysis never changes the selected wallet/)).toBeVisible();
  await expect(page.getByText('Separate recovery key required')).toHaveCount(0);
  const noticeBounds = await page.locator('.policy-lab-notice').boundingBox();
  const templateBounds = await page.getByText('Template', { exact: true }).boundingBox();
  expect(noticeBounds).toBeTruthy();
  expect(templateBounds).toBeTruthy();
  expect(templateBounds!.y - (noticeBounds!.y + noticeBounds!.height)).toBeGreaterThanOrEqual(16);
  await page.getByLabel('Policy template').selectOption('decaying');
  await page.getByRole('button', { name: 'Compile & analyze policy' }).click();
  await expect(page.getByText('Sanity checked')).toBeVisible();
  await expect(page.getByText(/intentionally reduce theft resistance/)).toBeVisible();
});

test('creates a guided recovery descriptor from a visible template', async ({ page }, testInfo) => {
  await page.goto('/multisig/new');
  await page.getByRole('button', { name: /^Recovery/ }).click();
  await expect(page.getByLabel('Wallet name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recovery wallet' })).toBeVisible();
  await expect(page.getByText('4,320 blocks', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('The wait starts separately for each received coin.')).toBeVisible();
  await revealInsight(page, 'Recovery key spending authority', testInfo.project.name === 'mobile');
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'can spend that coin by itself' })
  ).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    const tooltipBounds = await page
      .getByRole('tooltip')
      .filter({ hasText: 'can spend that coin by itself' })
      .evaluate((tooltip) => {
        const bounds = tooltip.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          bottom: bounds.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        };
      });
    expect(tooltipBounds.left).toBeGreaterThanOrEqual(12);
    expect(tooltipBounds.right).toBeLessThanOrEqual(tooltipBounds.viewportWidth - 12);
    expect(tooltipBounds.bottom).toBeLessThanOrEqual(tooltipBounds.viewportHeight);
  }
  await expect(page.getByText('Four separate keys')).toBeVisible();
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
  await expect(page.getByText('2 of 3 primary keys + recovery key later')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  await page.getByRole('button', { name: 'Descriptor logic' }).click();
  await expect(page.getByTestId('descriptor-preview')).toContainText('4,320 blocks');
  await saveSetupDescriptor(page, 'resilient-vault-descriptors.txt');
  await page.getByRole('button', { name: 'Finish hardware setup before first signature' }).click();
  await expect(page.getByLabel('App PIN', { exact: true })).toBeEnabled();
  await page.getByLabel('App PIN', { exact: true }).fill('recovery-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('recovery-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Resilient vault' })).toBeVisible();
});

test('keeps assisted recovery honest and offers simple recovery waits', async ({ page }) => {
  await page.goto('/multisig/new');
  const assisted = page.getByRole('button', { name: /^Assisted recovery/ });
  await expect(assisted).toBeDisabled();
  await expect(assisted).toContainText('Coming soon');
  await page.getByRole('button', { name: /^Recovery/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const recoveryWait = page.getByRole('group', { name: 'Recovery key wait' });
  await expect(recoveryWait).toBeVisible();
  await expect(recoveryWait.locator('.recovery-delay-title')).toHaveCSS('font-size', '13px');
  await expect(recoveryWait.getByRole('button').first()).toHaveCSS('border-radius', '12px');
  await page.getByRole('button', { name: /About 3 months/ }).click();
  await expect(page.getByText('13,140 blocks', { exact: true }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('About one year');
});

test('opens the exact existing wallet after duplicate multisig creation', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Duplicate policy');
  for (const key of [
    {
      label: 'Coldcard',
      fingerprint: 'f00dbabe',
      xpub: 'tpubD6NzVbkrYhZ4Y-fixture-coldcard-public-key'
    },
    {
      label: 'Trezor',
      fingerprint: 'c0ffee01',
      xpub: 'tpubD6NzVbkrYhZ4Y-fixture-trezor-public-key'
    },
    {
      label: 'Offline backup',
      fingerprint: 'deadbeef',
      xpub: 'tpubD6NzVbkrYhZ4Y-fixture-backup-public-key'
    }
  ]) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Signer label').fill(key.label);
    await page.getByLabel('Master fingerprint').fill(key.fingerprint);
    await page.getByLabel('Account xpub').fill(key.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }
  await page.getByRole('button', { name: 'Review wallet' }).click();
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  await saveSetupDescriptor(page, 'duplicate-policy-descriptors.txt');
  await page.getByRole('button', { name: 'Finish hardware setup before first signature' }).click();
  await page.getByLabel('App PIN', { exact: true }).fill('fixture-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('fixture-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'This exact descriptor wallet already exists'
  );
  const duplicateAlert = page.getByRole('alert');
  const duplicateAction = duplicateAlert.getByRole('button', { name: 'Open existing wallet' });
  await expect(page.locator('.toast-region .toast')).toHaveCount(0, { timeout: 10_000 });
  await duplicateAction.scrollIntoViewIfNeeded();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme
    );
    await duplicateAlert.screenshot({
      path: test.info().outputPath(`duplicate-wallet-${theme}.png`)
    });
  }
  if ((page.viewportSize()?.width ?? 1180) > 640) {
    const body = await duplicateAlert.locator('.warning-notice-body').boundingBox();
    const action = await duplicateAction.boundingBox();
    expect(action!.x).toBeGreaterThan(body!.x + body!.width);
  }
  await page.getByRole('button', { name: 'Open existing wallet' }).click();
  await expect(page).toHaveURL(/\/unlock$/);
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
});

test('rejects duplicate signer identity before insertion', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Duplicate test');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Enter public key' }).click();
  await page.getByLabel('Signer label').fill(keys[0].label);
  await page.getByLabel('Master fingerprint').fill(keys[0].fingerprint);
  await page.getByLabel('Account xpub').fill(keys[0].xpub);
  await page.getByRole('button', { name: 'Add key' }).click();

  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Enter public key' }).click();
  await page.getByLabel('Signer label').fill('Renamed duplicate');
  await page.getByLabel('Master fingerprint').fill(keys[0].fingerprint.toUpperCase());
  await page.getByLabel('Account xpub').fill('tpub-different-account-key');
  await page.getByRole('button', { name: 'Add key' }).click();

  const duplicateDialog = page.getByRole('dialog', { name: 'Enter public signer key' });
  await expect(duplicateDialog.getByRole('alert')).toContainText(
    `Fingerprint ${keys[0].fingerprint} is already used by “${keys[0].label}”.`
  );
  await expect(page.getByText('Signer already added', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /View Renamed duplicate details/ })).toHaveCount(0);
  await duplicateDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('1 of 3 signers added')).toBeVisible();
});

test('confirms signer removal before changing the unfinished wallet', async ({ page }) => {
  await page.goto('/multisig/new');
  await continueToSigners(page, 'Removal confirmation test');
  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Enter public key' }).click();
  await page.getByLabel('Signer label').fill(keys[0].label);
  await page.getByLabel('Master fingerprint').fill(keys[0].fingerprint);
  await page.getByLabel('Account xpub').fill(keys[0].xpub);
  await page.getByRole('button', { name: 'Add key' }).click();

  const signerRow = page.getByRole('button', { name: `View ${keys[0].label} details` });
  await page.getByRole('button', { name: `Remove ${keys[0].label}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove signer?' });
  await expect(dialog).toContainText(`Remove ${keys[0].label} from this unfinished wallet?`);
  await expect(dialog).toContainText('Its hardware signer and seed are not changed.');
  await expect(signerRow).toBeVisible();

  await dialog.getByRole('button', { name: 'Keep signer' }).click();
  await expect(signerRow).toBeVisible();
  await expect(page.getByText('1 of 3 signers added')).toBeVisible();

  await page.getByRole('button', { name: `Remove ${keys[0].label}` }).click();
  await page
    .getByRole('dialog', { name: 'Remove signer?' })
    .getByRole('button', { name: 'Remove signer' })
    .click();
  await expect(signerRow).toHaveCount(0);
  await expect(page.getByText('No signers yet', { exact: true })).toBeVisible();
  await expect(page.getByText('Signer removed', { exact: true })).toBeVisible();
});

test('coordinator has no horizontal overflow on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout assertion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/multisig/new');
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await continueToSigners(page, 'Mobile vault');
  await expect(page.getByRole('button', { name: 'Add a signer' })).toBeVisible();
  const motion = await page
    .locator('.form-card')
    .first()
    .evaluate((element) => ({
      animationDuration: getComputedStyle(element).animationDuration,
      transitionDuration: getComputedStyle(element).transitionDuration
    }));
  expect(parseFloat(motion.animationDuration || '0')).toBeLessThanOrEqual(0.001);
  expect(parseFloat(motion.transitionDuration || '0')).toBeLessThanOrEqual(0.001);
});
