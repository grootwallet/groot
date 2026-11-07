import { expect, test } from '@playwright/test';

for (const family of [false, true]) {
  test(`${family ? 'Family' : 'Partner'} backup preserves verified paths and signer roles`, async ({
    page
  }) => {
    await page.goto(`/multisig/backup?fixture-continuity=${family ? 'family' : 'partner'}`);

    const policy = page.locator('.continuity-backup-policy');
    await expect(policy.getByRole('heading', { name: 'Spending paths' })).toBeVisible();
    await expect(policy.getByText('This coin does not expire', { exact: true })).toBeVisible();
    await expect(policy.locator('.backup-policy-path')).toHaveCount(family ? 3 : 4);

    if (family) {
      const assistance = policy
        .locator('.backup-policy-path')
        .filter({ hasText: 'One parent and one child assistance signer' });
      await expect(assistance).toContainText('After 13,140 confirmations');
      await expect(assistance).toContainText('1 of 2 Parents');
      await expect(assistance).toContainText('1 of 2 Child assistance signers');
      await expect(assistance).toContainText('Parent 1');
      await expect(assistance).toContainText('00000001');
      await expect(assistance).toContainText('Parent');
      await expect(assistance).toContainText('Child assistance signer 1');
      await expect(assistance).toContainText('00000003');
      await expect(assistance).toContainText('Child assistance signer');
    } else {
      const estate = policy
        .locator('.backup-policy-path')
        .filter({ hasText: 'Estate guardians: 2 of 3' });
      await expect(estate).toContainText('After 52,560 confirmations');
      await expect(estate).toContainText('2 of 3 Estate guardians');
      await expect(estate).toContainText('Estate guardian 1');
      await expect(estate).toContainText('00000006');
      await expect(estate).toContainText('Estate guardian');
    }

    await page.getByLabel('Backup app PIN', { exact: true }).fill('prototype-passphrase');
    await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
    await page.emulateMedia({ media: 'print' });

    const printSheet = page.locator('.backup-print-sheet');
    await expect(printSheet).toBeVisible();
    await expect(printSheet.locator('.print-policy-path-list > .backup-policy-path')).toHaveCount(
      family ? 3 : 4
    );
    await expect(printSheet.getByText('This coin does not expire', { exact: true })).toBeVisible();
    await expect(
      printSheet.getByText(family ? 'Child assistance signer 1' : 'Estate guardian 1')
    ).toBeVisible();

    if ((page.viewportSize()?.width ?? 1180) > 760) {
      const renderer = await page.context().newPage();
      await renderer.setViewportSize({ width: 595, height: 842 });
      await renderer.setContent(await printSheet.evaluate((sheet) => sheet.outerHTML));
      await renderer.addStyleTag({ path: 'static/pdf-backup-renderer.css' });
      expect(
        await renderer
          .locator('.backup-print-sheet')
          .evaluate((sheet) => Math.ceil(sheet.getBoundingClientRect().height))
      ).toBeLessThanOrEqual(842);
      await renderer.close();
    }
  });
}

test('Continuity backup fails closed when native path metadata is unavailable', async ({
  page
}) => {
  await page.goto('/multisig/backup?fixture-continuity=partner&fixture-policy-status-offline=1');

  const policy = page.locator('.continuity-backup-policy');
  await expect(policy.getByText('Policy details unavailable', { exact: true })).toBeVisible();
  await expect(policy.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(policy.locator('.backup-policy-path')).toHaveCount(0);

  await page.getByLabel('Backup app PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Authorize & prepare backup' }).click();
  if ((page.viewportSize()?.width ?? 1180) > 760)
    await expect(page.getByRole('button', { name: 'Save PDF' })).toBeDisabled();
  await expect(page.locator('.backup-print-sheet')).toHaveCount(0);
});
