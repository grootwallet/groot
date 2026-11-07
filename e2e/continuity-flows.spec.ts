import { expect, test } from '@playwright/test';

for (const family of [false, true]) {
  test(`${family ? 'Family' : 'Partner'} test-network setup exposes exact roles`, async ({
    page
  }) => {
    await page.goto('/multisig/new');
    await page
      .getByRole('button', { name: family ? /^Family continuity/ : /^Partner continuity/ })
      .click();
    await expect(page.locator('.policy-kind-card.active')).toContainText(
      family ? 'Family continuity' : 'Partner continuity'
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Wallet name').fill('Disposable continuity test');
    await expect(page.locator('.continuity-path-visual')).toContainText('13,140');
    await expect(page.locator('.continuity-path-visual')).toContainText('52,560');
    await page.getByRole('button', { name: 'Continue to signers' }).click();
    await expect(page.getByText('No signers yet', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (theme) => document.documentElement.setAttribute('data-theme', theme),
        theme
      );
      await page.screenshot({
        path: test
          .info()
          .outputPath(`continuity-setup-${family ? 'family' : 'partner'}-${theme}.png`),
        fullPage: true
      });
    }
  });
}

test('Partner coins show every spending path and exact per-coin block status', async ({ page }) => {
  await page.goto('/coins?fixture-continuity=partner');

  const firstCoin = page.locator('article.coin-row').first();
  await firstCoin.locator('.coin-details-toggle').click();
  const policy = firstCoin.locator('.coin-policy-section');
  await expect(policy.getByText('This coin does not expire', { exact: true })).toBeVisible();
  await expect(
    policy.getByText(
      'New spending paths become available over time. Earlier paths remain available unless a chain reorganization reduces this coin’s confirmed age.',
      { exact: true }
    )
  ).toBeVisible();

  const paths = policy.locator('article.coin-policy-path');
  await expect(paths).toHaveCount(4);
  expect(
    await paths.first().evaluate((path) => {
      const children = Array.from(path.children).map((child) => child.getBoundingClientRect());
      return children.every(
        (child, index) => index === 0 || child.top >= children[index - 1].bottom
      );
    })
  ).toBe(true);
  for (const pathName of [
    'Owner: 2 of 3',
    'Both partner signers',
    'Either partner signer',
    'Estate guardians: 2 of 3'
  ]) {
    await expect(policy.getByText(pathName, { exact: true })).toBeVisible();
  }

  const ownerPath = paths.filter({ hasText: 'Owner: 2 of 3' });
  await expect(ownerPath).toContainText('2 of 3 Owner signers');
  await expect(ownerPath).toContainText('Owner signer 1');
  await expect(ownerPath).toContainText('00000001');

  const estatePath = paths.filter({ hasText: 'Estate guardians: 2 of 3' });
  await expect(estatePath).toContainText('12,560 blocks remaining');
  await expect(estatePath.getByText('Block 262,561', { exact: true })).toBeVisible();
  await expect(estatePath.getByText('Calendar estimate', { exact: true })).toBeVisible();
  await expect(
    estatePath.getByText('Unavailable on Regtest because blocks are mined manually.', {
      exact: true
    })
  ).toBeVisible();
  await expect(policy.getByText('Estimated around', { exact: true })).toHaveCount(0);

  const oneBlockCoin = page.locator('article.coin-row').nth(2);
  await oneBlockCoin.locator('.coin-details-toggle').click();
  const oneBlockAssistance = oneBlockCoin
    .locator('article.coin-policy-path')
    .filter({ hasText: 'Both partner signers' });
  await expect(oneBlockAssistance.getByText('1 block remaining', { exact: true })).toBeVisible();
  await expect(oneBlockAssistance.getByText('Block 250,002', { exact: true })).toBeVisible();

  const unconfirmedCoin = page.locator('article.coin-row').nth(3);
  await unconfirmedCoin.locator('.coin-details-toggle').click();
  const unconfirmedPaths = unconfirmedCoin.locator('article.coin-policy-path');
  await expect(
    unconfirmedPaths
      .filter({ hasText: 'Owner: 2 of 3' })
      .getByText('Available now', { exact: true })
  ).toBeVisible();
  for (const delayedPath of [
    'Both partner signers',
    'Either partner signer',
    'Estate guardians: 2 of 3'
  ]) {
    await expect(
      unconfirmedPaths
        .filter({ hasText: delayedPath })
        .getByText('Starts after confirmation', { exact: true })
    ).toBeVisible();
  }
  await expect(unconfirmedCoin.getByText('Earliest inclusion', { exact: true })).toHaveCount(0);
  await expect(unconfirmedCoin.getByText('Estimated around', { exact: true })).toHaveCount(0);
  await expect(unconfirmedCoin.getByText('Calendar estimate', { exact: true })).toHaveCount(0);
  await expect(
    unconfirmedCoin.getByText('Renewal timing starts after confirmation', { exact: true })
  ).toBeVisible();
  await expect(unconfirmedCoin.getByText('Renewal is recommended in 0 blocks')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Family assistance presents two required role groups instead of a flat threshold', async ({
  page
}) => {
  await page.goto('/coins?fixture-continuity=family');
  const coin = page.locator('article.coin-row').first();
  await coin.locator('.coin-details-toggle').click();
  const paths = coin.locator('article.coin-policy-path');

  await expect(paths).toHaveCount(3);
  for (const pathName of [
    'Both parents',
    'One parent and one child assistance signer',
    'Inheritance: 2 of 3'
  ]) {
    await expect(coin.getByText(pathName, { exact: true })).toBeVisible();
  }

  const assistance = paths.filter({ hasText: 'One parent and one child assistance signer' });
  await expect(assistance).toContainText('1 of 2 Parents');
  await expect(assistance).toContainText('1 of 2 Child assistance signers');
  await expect(assistance).toContainText('Parent 1');
  await expect(assistance).toContainText('Child assistance signer 1');
  await expect(assistance.getByText('2 of 4', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Continuity recovery drill shows exact named paths and role groups', async ({ page }) => {
  await page.goto('/multisig/recover?fixture-continuity=family');
  const backup = await page.evaluate(async () => {
    const modulePath = '/src/lib/wallet/index.ts';
    const { walletService } = await import(/* @vite-ignore */ modulePath);
    return walletService.exportMultisig('prototype-passphrase');
  });
  await page.getByLabel('Recovery descriptor backup').fill(backup);
  await page.getByRole('button', { name: 'Validate backup' }).click();

  const recoveredPolicy = page.getByRole('region', { name: 'Recovered spending policy' });
  await expect(recoveredPolicy).toBeVisible();
  await expect(recoveredPolicy.locator('article.recovered-path')).toHaveCount(3);
  await expect(recoveredPolicy.getByText('Both parents', { exact: true })).toBeVisible();
  const assistance = recoveredPolicy
    .locator('article.recovered-path')
    .filter({ hasText: 'One parent and one child assistance signer' });
  await expect(assistance).toContainText('1 of 2 Parents');
  await expect(assistance).toContainText('1 of 2 Child assistance signers');
  await expect(recoveredPolicy.getByText(/2 of (7|8) wallet policy/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Continuity overview explains named paths without a single-backup-key claim', async ({
  page
}) => {
  await page.goto('/multisig?fixture-continuity=partner');
  const pathPanel = page.locator('.policy-maturity-panel');
  await expect(pathPanel.getByRole('heading', { name: 'Spending paths' })).toBeVisible();
  await expect(
    pathPanel.getByText('The primary path remains available for every coin.', { exact: true })
  ).toBeVisible();
  await pathPanel.getByText('How spending paths work', { exact: true }).click();
  await expect(pathPanel.getByText('Coins do not expire.', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'The primary signer group can spend now. Delayed paths require the named signer groups shown in each coin’s policy.',
      { exact: true }
    )
  ).toBeVisible();
  await expect(page.getByText(/backup key can spend that coin alone/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('named delayed paths retain their roles and exact block delay through review', async ({
  page
}) => {
  await page.goto('/coins?fixture-continuity=partner');
  const outpoint = await page.evaluate(async () => {
    const modulePath = '/src/lib/wallet/index.ts';
    const { walletService } = await import(/* @vite-ignore */ modulePath);
    return (await walletService.snapshot()).utxos.find(
      (coin: { policyMaturity?: unknown }) => coin.policyMaturity
    )?.outpoint;
  });
  expect(outpoint).toBeTruthy();
  await page.goto(
    `/multisig/send?fixture-continuity=partner&coins=${encodeURIComponent(outpoint)}&delayedSpend=1`
  );
  const paths = page.getByLabel('Spending path', { exact: true });
  await expect(paths).toBeVisible();
  await expect(paths.locator('option[value="3"]')).toHaveJSProperty('disabled', true);
  await paths.selectOption('2');
  await expect(page.getByText('1 of 2 Partner signers', { exact: true })).toBeVisible();
  const signerGroup = page.locator('.named-path-groups').first();
  await expect(signerGroup).toContainText('Partner signer 1');
  await expect(signerGroup).toContainText('00000004');
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Label', { exact: true }).fill('Named path fixture');
  await page.getByRole('button', { name: /Review .*payment/ }).click();
  await expect(paths).toHaveCount(0);
  await expect(page.getByText(/Either partner signer · 39420/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme
    );
    await page.screenshot({
      path: test.info().outputPath(`continuity-path-review-${theme}.png`),
      fullPage: true
    });
  }
});

test('Family assistance keeps collecting until both required role groups sign', async ({
  page
}) => {
  await page.goto('/coins?fixture-continuity=family');
  const outpoint = await page.evaluate(async () => {
    const modulePath = '/src/lib/wallet/index.ts';
    const { walletService } = await import(/* @vite-ignore */ modulePath);
    return (await walletService.snapshot()).utxos.find(
      (coin: { policyMaturity?: unknown }) => coin.policyMaturity
    )?.outpoint;
  });
  await page.goto(
    `/multisig/send?fixture-continuity=family&coins=${encodeURIComponent(outpoint)}&delayedSpend=1`
  );
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Label', { exact: true }).fill('Family role fixture');
  await page.getByRole('button', { name: /Review .*payment/ }).click();
  for (let signer = 0; signer < 3; signer++) {
    await page.getByRole('button', { name: 'Import signed PSBT', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import signed PSBT' });
    await dialog.getByLabel('Signed PSBT', { exact: true }).fill(`synthetic-role-${signer}`);
    await dialog.getByRole('button', { name: 'Validate & merge', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const notices = page.locator('.toast');
    await expect(notices.filter({ hasText: 'Signed PSBT merged' })).toBeVisible();
    await notices.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(notices).toHaveCount(0);
    if (signer < 2)
      await expect(
        page.getByRole('button', { name: 'Import signed PSBT', exact: true })
      ).toBeEnabled();
    if (signer === 1) {
      await expect(
        page.getByText(
          'Required signer roles are still missing. Review the selected spending path.'
        )
      ).toBeVisible();
      await expect(page.getByText('Ready to finalize', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      for (const theme of ['light', 'dark']) {
        await page.evaluate(
          (theme) => document.documentElement.setAttribute('data-theme', theme),
          theme
        );
        await page.screenshot({
          path: test.info().outputPath(`family-required-roles-${theme}.png`),
          fullPage: true
        });
      }
    }
  }
  await expect(page.getByText('Ready to finalize', { exact: true })).toBeVisible();
});

test('a saved path shows the native availability reason before collecting more signatures', async ({
  page
}) => {
  await page.goto('/coins?fixture-continuity=partner');
  const outpoint = await page.evaluate(async () => {
    const modulePath = '/src/lib/wallet/index.ts';
    const { walletService } = await import(/* @vite-ignore */ modulePath);
    return (await walletService.snapshot()).utxos.find(
      (coin: { policyMaturity?: unknown }) => coin.policyMaturity
    )?.outpoint;
  });
  await page.goto(
    `/multisig/send?fixture-continuity=partner&fixture-continuity-saved-path-unavailable&coins=${encodeURIComponent(outpoint)}&delayedSpend=1`
  );
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Label', { exact: true }).fill('Native availability fixture');
  await page.getByRole('button', { name: /Review .*payment/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Sync this wallet before checking spending paths.' })
  ).toBeVisible();
  await expect(
    page.getByText('Required signer roles are still missing. Review the selected spending path.')
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
