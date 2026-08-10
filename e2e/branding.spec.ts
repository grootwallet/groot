import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(scrollWidth).toBe(clientWidth);
}

test('Groot branding is visible across wallet themes', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript((selectedTheme) => localStorage.setItem('satchel-theme', selectedTheme), theme);
    await page.goto('/welcome');

    await expect(page).toHaveTitle('Groot');
    await expect(page.locator('a[aria-label="Groot home"]:visible')).toBeVisible();
    await expect(page.locator('[role="img"][aria-label="Groot"]:visible').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Satchel');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectNoHorizontalOverflow(page);
  }
});

test('Groot branding and metadata are visible on marketing', async ({ page }) => {
  await page.goto('/marketing');

  await expect(page).toHaveTitle('Groot · Hold your own');
  await expect(page.getByRole('link', { name: 'Groot marketing home' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Groot' }).first()).toBeVisible();
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute('content', 'Groot');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Groot · Hold your own');
  await expect(page.locator('body')).not.toContainText('Satchel');
  await expectNoHorizontalOverflow(page);
});
