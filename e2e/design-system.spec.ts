import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/',
  '/activity',
  '/coins',
  '/receive',
  '/send',
  '/settings',
  '/diagnostics',
  '/multisig',
  '/multisig/policy',
  '/multisig/receive',
  '/multisig/send',
  '/multisig/new',
  '/multisig/recover',
  '/multisig/backup',
  '/multisig/delete',
  '/hardware/new',
  '/welcome?fixture-empty=1',
  '/unlock?fixture-locked-wallet-switch=1'
];

async function settled(page: Page) {
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('.wallet-skeleton')).toHaveCount(0);
}

async function contained(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth
  }));
  expect(dimensions.scroll).toBe(dimensions.width);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} shared design covers every route without overflow or external fonts`, async ({
    page
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    const fontRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fontRequests.push(request.url());
    });
    await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
    for (const [index, route] of routes.entries()) {
      await page.goto(route);
      await settled(page);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.fonts.check('400 14px "Source Sans 3"'))).toBe(
        true
      );
      await expect(page.locator('body')).toHaveCSS(
        'color',
        theme === 'light' ? 'rgb(16, 42, 76)' : 'rgb(247, 243, 233)'
      );
      await expect(page.locator('h1').first()).toHaveCSS('font-family', /Source Sans 3/);
      await contained(page);
      if (route === '/hardware/new') {
        const guides = page.getByRole('button', { name: 'Device setup guides' });
        await guides.scrollIntoViewIfNeeded();
        const button = await guides.boundingBox();
        const footer = await page.locator('.build-identity-onboarding').boundingBox();
        expect(button).not.toBeNull();
        expect(footer).not.toBeNull();
        expect(button!.y + button!.height).toBeLessThanOrEqual(footer!.y);
        await page.screenshot({
          path: test.info().outputPath(`setup-footer-${theme}.png`),
          scale: 'css'
        });
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      // Viewport capture avoids WebKit's full-page inherited-color capture artifact.
      await page.screenshot({
        path: test.info().outputPath(`${index}-${theme}.png`),
        scale: 'css'
      });
    }
    expect(fontRequests.length).toBeGreaterThan(0);
    expect(
      fontRequests.every(
        (url) => url === new URL('/fonts/source-sans-3.052R.woff2', page.url()).href
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('local font failure never blocks balance, navigation, or editable payment fields', async ({
  page
}) => {
  await page.route('**/fonts/*.woff2', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.balance-value')).toBeVisible();
  await page.locator('.balance-value').click();
  await expect(page.locator('.balance-value')).toContainText('BTC');
  await page.goto('/send');
  await settled(page);
  await expect(page.locator('.send-signers')).toBeVisible();
  await contained(page);
  await page
    .getByRole('textbox', { name: 'Payment label', exact: true })
    .fill('Synthetic font fallback');
  await expect(page.getByRole('textbox', { name: 'Payment label', exact: true })).toHaveValue(
    'Synthetic font fallback'
  );
});

test('translated compact layouts, zoom-equivalent reflow, and reduced motion retain controls', async ({
  page
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const language of ['fr', 'es']) {
    await page.addInitScript((value) => localStorage.setItem('groot-language', value), language);
    await page.setViewportSize({ width: 320, height: 844 });
    for (const route of [
      '/',
      '/send',
      '/receive',
      '/settings',
      '/multisig',
      '/hardware/new',
      '/welcome?fixture-empty=1'
    ]) {
      await page.goto(route);
      await settled(page);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await contained(page);
    }
  }
  // 200% browser zoom halves an 1180px viewport's effective CSS width.
  // CSS zoom alone would not exercise the browser-zoom media-query behavior.
  await page.setViewportSize({ width: 590, height: 390 });
  await page.goto('/settings');
  await settled(page);
  await contained(page);
  await expect(page.locator('h1').first()).toBeVisible();
  await page.locator('.settings-list button').first().focus();
  await expect(page.locator('.settings-list button').first()).toBeFocused();
  await expect(page.locator('.settings-list button').first()).toHaveCSS('outline-style', 'solid');
  const duration = await page
    .locator('.settings-list button')
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration.split(',').every((value) => Number.parseFloat(value) <= 0.00001)).toBe(true);
});
