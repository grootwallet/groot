import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(scrollWidth).toBe(clientWidth);
}

test('Groot branding is visible across wallet themes', async ({ page }, info) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript(
      (selectedTheme) => localStorage.setItem('groot-theme', selectedTheme),
      theme
    );
    await page.goto('/welcome?add=1');

    await expect(page).toHaveTitle('Groot');
    const headerLockup = page.locator('.onboarding-brand-lockup [role="img"][aria-label="Groot"]');
    if (info.project.name === 'mobile') {
      await expect(headerLockup).toBeHidden();
      await expect(page.locator('.hero-mark svg')).toBeVisible();
      await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Choose your wallet' })).toBeVisible();
    }
    await expect(headerLockup).toBeVisible();
    await expect(headerLockup).toHaveCSS('width', '104px');
    expect((await headerLockup.boundingBox())?.height).toBeLessThan(40);
    await expect(page.locator('body')).not.toContainText('Satchel');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectNoHorizontalOverflow(page);
  }
});
