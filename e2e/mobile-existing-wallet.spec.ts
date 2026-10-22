import { test, expect } from '@playwright/test';

for (const [route, heading] of [
  ['/mobile/pair', 'Join a shared wallet'],
  ['/mobile/recover', 'Restore a shared wallet'],
  ['/mobile/watch', 'Import a desktop hardware wallet']
]) {
  test(`locked existing wallet permits separate setup at ${route}`, async ({ page }) => {
    await page.clock.install();
    await page.goto(`${route}?fixture-native-mobile=1&fixture-locked-wallet-switch=1`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.clock.runFor(2500);
    await expect(page).toHaveURL(new RegExp(route));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    const locked = await page.evaluate(async () => {
      const modulePath = '/src/lib/wallet/index.ts';
      const { walletService } = await import(modulePath);
      return !(await walletService.session()).unlocked;
    });
    expect(locked).toBe(true);
  });
}

test('Add another wallet reaches phone pairing without unlocking the existing wallet', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.clock.install();
  await page.goto('/unlock?fixture-native-mobile=1&fixture-locked-wallet-switch=1');
  await page.getByRole('link', { name: 'Add another wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
  await page.getByRole('link', { name: /Connect desktop app/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Join a shared wallet', exact: true })
  ).toBeVisible();
  await page.clock.runFor(2500);
  await expect(page).toHaveURL(/\/mobile\/pair/);
  await expect(page.getByRole('button', { name: 'Allow camera', exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('existing-wallet-phone-pairing.png'),
    animations: 'disabled'
  });
});
