import { test, expect } from '@playwright/test';

// Browser fixtures exercise native-mobile presentation, never real keys or RPC.
test.use({ video: process.env.MOBILE_KEY_EVIDENCE_DIR ? 'on' : 'retain-on-failure' });
for (const theme of ['light', 'dark']) {
  test(`${theme} native mobile keeps setup actions clear and requires remote sync`, async ({
    page
  }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
    await page.goto('/welcome?fixture-empty=1&fixture-native-mobile=1');
    await expect(page.locator('.app-shell')).toHaveClass(/native-mobile/);
    await expect(page.locator('.build-identity-onboarding')).toHaveCount(0);
    const overlay = page.locator('.onboarding-overlay');
    expect(
      await overlay.evaluate((node) => node.scrollHeight - node.clientHeight)
    ).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
    await page.getByRole('link', { name: /Watch desktop wallet/ }).scrollIntoViewIfNeeded();
    await expect(page.locator('.build-identity-onboarding')).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`phone-choices-${theme}.png`)
    });

    await page.goto('/?fixture-initial-history-required=1&fixture-native-mobile=1');
    const modal = page.getByRole('dialog', { name: 'Approve wallet-history scan' });
    await expect(modal.getByText('Set up wallet sync', { exact: true })).toBeVisible();
    await expect(modal).toContainText('Groot managed access is Mainnet-only');
    await expect(modal.getByRole('button', { name: 'Approve and scan' })).toBeDisabled();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`phone-remote-setup-${theme}.png`)
    });
    // Keep the simulated device identity stable across SPA navigation, as native does.
    await page.evaluate(async () => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService, WalletError } = await import(path);
      const runtime = await walletService.runtimePlatform();
      walletService.runtimePlatform = async () => runtime;
      // Native mobile cannot sync before a trusted endpoint is configured.
      // Keep the browser adapter from silently completing this offline fixture.
      walletService.sync = async () => {
        throw new WalletError('network_unavailable', 'Synthetic mobile node is not configured.');
      };
    });
    await modal.getByRole('button', { name: 'Set up my own node' }).click();
    await expect(page.getByRole('dialog', { name: 'Connect Bitcoin Core' })).toBeVisible();
    await page
      .getByRole('dialog', { name: 'Connect Bitcoin Core' })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await page.locator('.mobile-nav').getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const setup = page.locator('.mobile-sync-notice');
    await expect(setup).toContainText('Set up wallet sync');
    await expect(page.locator('.initial-history-scan')).toHaveCount(0);
    expect((await setup.boundingBox())!.height).toBeLessThanOrEqual(100);
    await expect(page.locator('.mobile-brand')).toBeHidden();
    const next = setup.locator('xpath=following-sibling::*[1]');
    const a = await setup.boundingBox(),
      b = await next.boundingBox();
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`phone-overview-notices-${theme}.png`)
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}
