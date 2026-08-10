import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(widths.scroll).toBe(widths.client);
}

test('marketing proof and public evidence routes stay honest and responsive', async ({ page, request }) => {
  const mobile = (page.viewportSize()?.width ?? 1180) <= 760;

  await page.goto('/marketing');
  await expect(page.getByRole('heading', { name: 'Hold your own.' })).toBeVisible();
  await expect(page.locator('.hero .marketing-nav')).toHaveCount(0);
  await expect(page.getByText('Test-network release. Mainnet is not enabled.').first()).toBeVisible();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/favicon\.svg$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/marketing\/social-card\.png$/);
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /max-image-preview:large/);
  await expect(page.locator('link[rel="alternate"][type="text/plain"]')).toHaveAttribute('href', /\/llms\.txt$/);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const policySource = await page.locator('.proof').first().getByRole('img').evaluate((image: HTMLImageElement) => image.currentSrc);
  expect(policySource).toContain(mobile ? 'wallet-policy-mobile.png' : 'wallet-policy.png');

  await page.goto('/marketing#principles');
  await page.locator('#product').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await expect(page.locator('.desktop-links a.active')).toHaveCount(1);
  await expect(page.locator('.desktop-links a.active')).toHaveText('Product');

  if (mobile) {
    await page.getByText('Menu', { exact: true }).click();
    await page.getByRole('link', { name: 'Security model', exact: true }).click();
  } else {
    await page.getByRole('link', { name: 'Security', exact: true }).first().click();
  }

  await expect(page).toHaveURL(/\/marketing\/security$/);
  await expect(page.getByRole('heading', { name: 'Trust the smallest possible boundary.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What is not proven yet.' })).toBeVisible();
  await expect(page.getByText('Mainnet remains compile-time disabled', { exact: false })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/marketing/status');
  await expect(page.getByRole('heading', { name: 'Built on regtest. Not ready for mainnet.' })).toBeVisible();
  await expect(page.getByText('Physical hardware and camera certification is incomplete.')).toHaveCount(0);
  await expect(page.getByText('Hardware matrix', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Documentation map' })).toHaveAttribute('href', '/marketing/docs');
  await expect(page.locator('.marketing-nav a[aria-current="page"]').first()).toContainText('Development status');
  const navigation = page.locator('.marketing-nav');
  await page.waitForTimeout(950);
  await page.evaluate(() => window.scrollTo(0, 1_400));
  await expect(navigation).toHaveClass(/hidden/);
  await page.evaluate(() => window.scrollBy(0, -320));
  await expect(navigation).not.toHaveClass(/hidden/);
  await expect(navigation).toHaveCSS('z-index', '1000');
  const restoredNavigation = await navigation.evaluate((element) => {
    const style = getComputedStyle(element);
    const topElement = document.elementFromPoint(window.innerWidth / 2, 40);
    return {
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
      isTopLayer: Boolean(topElement?.closest('.marketing-nav'))
    };
  });
  expect(restoredNavigation.backdropFilter).toContain('blur(12px)');
  expect(restoredNavigation.isTopLayer).toBe(true);
  await expectNoHorizontalOverflow(page);

  await page.goto('/marketing/docs');
  await expect(page.getByRole('heading', { name: 'Read the system.' })).toBeVisible();
  await expect(page.getByText('docs/security-model.md', { exact: true })).toBeVisible();
  await expect(page.getByText('docs/implementation-status.md', { exact: true })).toBeVisible();
  await expect(page.locator('.marketing-nav a[aria-current="page"]').first()).toContainText('Documentation');
  await expectNoHorizontalOverflow(page);

  const llms = await request.get('/llms.txt');
  expect(llms.ok()).toBe(true);
  expect(await llms.text()).toContain('Mainnet is compile-time disabled');
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain('Allow: /marketing');
});
