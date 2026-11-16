import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`${theme} native mobile content scrolls between header and bottom controls`, async ({
    page
  }, info) => {
    test.skip(info.project.name !== 'mobile');
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
    await page.goto('/?fixture-native-mobile=1');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15_000
    });
    const main = page.locator('main.main');
    await expect(page.locator('.mobile-brand')).toBeHidden();
    const actions = page.locator('.mobile-actions');
    const navigation = page.locator('.mobile-nav');
    const mainBox = await main.boundingBox(),
      actionBox = await actions.boundingBox(),
      navBox = await navigation.boundingBox();
    expect(mainBox && actionBox && navBox).toBeTruthy();
    expect(mainBox!.y).toBe(0);
    expect(navBox!.height).toBe(49);
    expect(navBox!.y + navBox!.height).toBe(844);
    const activeNavigation = navigation.locator('a.active');
    const selection = await activeNavigation.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        decoration: getComputedStyle(node, '::before').content
      };
    });
    expect(selection.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(selection.decoration).toBe('none');
    const activeNavigationBox = await activeNavigation.boundingBox();
    const navigationItemCount = await navigation.getByRole('link').count();
    const navigationBorderTop = await navigation.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).borderTopWidth)
    );
    expect(activeNavigationBox).toBeTruthy();
    expect(activeNavigationBox!.width).toBeCloseTo(navBox!.width / navigationItemCount, 1);
    expect(activeNavigationBox!.y).toBeCloseTo(navBox!.y + navigationBorderTop, 1);
    expect(activeNavigationBox!.y + activeNavigationBox!.height).toBeCloseTo(
      navBox!.y + navBox!.height,
      1
    );
    expect(mainBox!.y + mainBox!.height).toBeLessThanOrEqual(actionBox!.y - 8);
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y - 8);
    await main.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    expect(await main.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    const after = await main.boundingBox();
    expect(after).toEqual(mainBox);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await navigation.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBe(0);
    await navigation.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBe(0);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    expect(browserErrors).toEqual([]);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`${theme}-native-content-frame.png`)
    });
  });
}
