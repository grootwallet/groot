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
  await expect(page.getByText('Required signatures: 1', { exact: true })).toBeVisible();
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
    `/multisig/send?fixture-continuity=partner&coins=${encodeURIComponent(outpoint)}&delayedSpend=1`
  );
  await page.getByLabel('Bitcoin address').fill('bcrt1qdummy00085n8k2r7v4cx9s6jlawephgzuqf5t8ul');
  await page.getByLabel('Label', { exact: true }).fill('Native availability fixture');
  await page.evaluate(async () => {
    const modulePath = '/src/lib/wallet/index.ts';
    const { walletService } = await import(/* @vite-ignore */ modulePath);
    const original = walletService.prepareMultisigDelayedSpend.bind(walletService);
    walletService.prepareMultisigDelayedSpend = async (...args: unknown[]) => {
      const proposal = await original(...args);
      proposal.spendingPathDetails.available = false;
      proposal.spendingPathDetails.reason = 'Sync this wallet before checking spending paths.';
      proposal.canFinalize = false;
      return proposal;
    };
  });
  await page.getByRole('button', { name: /Review .*payment/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Sync this wallet before checking spending paths.' })
  ).toBeVisible();
  await expect(
    page.getByText('Required signer roles are still missing. Review the selected spending path.')
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
