import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`${theme} hardware import failure stays structured after closing the scan and can retry`, async ({
    page
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('groot-theme', value);
      sessionStorage.setItem('fixture-hardware-external-import-failure', '1');
    }, theme);
    await page.goto('/hardware/new');
    await page.getByRole('button', { name: /Connect with cable/ }).click();
    const scan = page.getByRole('dialog', { name: 'Connect hardware signer' });
    await scan.getByRole('button', { name: /Virtual Coldcard/ }).click();
    await expect(scan.getByRole('alert')).toContainText(
      'Unlock the signer and quit other wallet apps'
    );
    await scan.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(scan).toHaveCount(0);
    const error = page.getByRole('alert');
    await expect(error).toContainText('Unlock the signer and quit other wallet apps');
    await expect(error).toHaveClass(/warning-notice.*danger/);
    await expect(error.locator('svg')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: test.info().outputPath(`hardware-import-error-${theme}.png`),
      fullPage: true
    });
    await page.evaluate(() =>
      sessionStorage.removeItem('fixture-hardware-external-import-failure')
    );
    await page.getByRole('button', { name: /Connect with cable/ }).click();
    await scan.getByRole('button', { name: /Virtual Coldcard/ }).click();
    await expect(page.getByText('PUBLIC DATA REVIEW')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

for (const theme of ['light', 'dark']) {
  test(`${theme} shared load retry and credential errors stay readable and reachable`, async ({
    page
  }) => {
    await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
    await page.goto('/activity?fixture-large-history=1&fixture-history-page-error=1');
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Transactions are unavailable');
    await page.getByRole('button', { name: 'Try again', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`load-error-${theme}.png`),
      fullPage: true
    });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.tx-row')).toHaveCount(100);
    await page.goto('/unlock?fixture-locked-wallet-switch=1');
    const credential = page.getByLabel('Wallet passphrase', { exact: true });
    await credential.fill('synthetic-incorrect-credential');
    await page.getByRole('button', { name: 'Unlock wallet', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/Incorrect|incorrect/);
    await expect(page.getByRole('alert')).toHaveClass(/warning-notice.*danger/);
    await expect(credential).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: test.info().outputPath(`credential-error-${theme}.png`),
      fullPage: true
    });
  });
}
