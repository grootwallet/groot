import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP_VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
for (const language of ['en', 'fr', 'es'] as const) {
  test(`offline release notes dismiss once per version (${language})`, async ({ page }) => {
    await page.addInitScript(
      ({ language, dark }) => {
        localStorage.setItem('groot-language', language);
        localStorage.setItem('groot-theme', dark ? 'dark' : 'light');
        sessionStorage.setItem('fixture-whats-new', '1');
      },
      { language, dark: process.env.GROOT_E2E_DARK === '1' }
    );
    await page.goto('/');
    const modal = page.getByRole('dialog', {
      name: language === 'en' ? 'What’s new' : language === 'fr' ? 'Nouveautés' : 'Novedades'
    });
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal.locator('li')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: test.info().outputPath(`notes-${language}.png`),
      animations: 'disabled'
    });
    await modal
      .getByRole('button', {
        name: language === 'en' ? 'Continue' : language === 'fr' ? 'Continuer' : 'Continuar',
        exact: true
      })
      .click();
    await expect(modal).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('groot-notes-dismissed-version'))).toBe(
      APP_VERSION
    );
    await page.reload();
    await expect(modal).toBeHidden();
  });
}
test('updates handles offline retry, no update, verification failure and prepared installer', async ({
  page
}) => {
  await page.addInitScript((dark) => {
    localStorage.setItem('groot-language', 'en');
    localStorage.setItem('groot-theme', dark ? 'dark' : 'light');
    sessionStorage.setItem('fixture-app-update', 'offline');
  }, process.env.GROOT_E2E_DARK === '1');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Updates', exact: true }).last().click();
  const modal = page.getByRole('dialog', { name: 'Updates', exact: true });
  await expect(modal.getByRole('checkbox')).not.toBeChecked();
  await modal.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(modal).toContainText('Could not reach GitHub');
  await page.evaluate(() => sessionStorage.removeItem('fixture-app-update'));
  await modal.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(modal).toContainText('You are up to date.');
  await page.evaluate(() => sessionStorage.setItem('fixture-app-update', 'available'));
  await modal.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(modal).toContainText('New update available');
  await page.evaluate(() =>
    sessionStorage.setItem('fixture-update-download', 'verification_failed')
  );
  await modal.getByRole('button', { name: 'Download verified installer' }).click();
  await expect(modal).toContainText('download was discarded');
  await page.evaluate(() => sessionStorage.removeItem('fixture-update-download'));
  await modal.getByRole('button', { name: 'Download verified installer' }).click();
  await expect(modal.getByRole('button', { name: 'Reveal installer' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('verified-fixture.png'),
    animations: 'disabled'
  });
  await modal.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(modal).toBeHidden();
  const action = page.getByRole('button', { name: 'New update available', exact: true });
  if (await page.locator('.toast-region .toast').last().isVisible())
    await expect(action).toBeHidden();
  await expect(action).toBeVisible({ timeout: 10_000 });
  await action.click();
  await expect(modal).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('cancelled checks discard late offers and rate limits retain their wait instruction', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('groot-language', 'en');
    sessionStorage.setItem('fixture-app-update', 'available');
    sessionStorage.setItem('fixture-update-delay', '1');
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Updates', exact: true }).last().click();
  const modal = page.getByRole('dialog', { name: 'Updates', exact: true });
  await modal.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Updates', exact: true }).last().click();
  await expect(modal).toContainText('Update cancelled.');
  await expect(modal.getByRole('button', { name: 'Check for updates', exact: true })).toBeEnabled();
  await expect(modal.getByText('New update available', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.removeItem('fixture-update-delay');
    sessionStorage.setItem('fixture-app-update', 'rate_limited');
  });
  await modal.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(modal).toContainText('Try again in an hour');
});
