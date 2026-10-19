import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`${theme} native mobile content scrolls between header and bottom controls`, async ({
    page
  }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
    await page.goto('/?fixture-native-mobile=1');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
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
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`${theme}-native-content-frame.png`)
    });
  });
}
