import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ video: process.env.MOBILE_KEY_EVIDENCE_DIR ? 'on' : 'retain-on-failure' });

for (const theme of ['light', 'dark']) {
  test(`${theme} phone choices and QR permission retry remain usable`, async ({ page }, info) => {
    await page.addInitScript((value) => {
      localStorage.setItem('groot-theme', value);
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new DOMException('Synthetic permission denial', 'NotAllowedError');
          }
        }
      });
    }, theme);
    const capture = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      if (!process.env.MOBILE_KEY_EVIDENCE_DIR) return;
      const directory = resolve(process.env.MOBILE_KEY_EVIDENCE_DIR, info.project.name);
      mkdirSync(directory, { recursive: true });
      await page.screenshot({ path: resolve(directory, `${theme}-${name}.png`), fullPage: true });
    };
    await page.goto('/welcome?fixture-empty=1');
    await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
    const join = page.getByRole('link', { name: /Connect desktop app/ });
    if (info.project.name === 'mobile') {
      await expect(join).toBeVisible();
      await expect(page.getByRole('link', { name: /Restore phone signer/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Watch desktop wallet/ })).toBeVisible();
    } else await expect(join).toHaveCount(0);
    await capture('wallet-choices');

    for (const [route, heading] of [
      ['/mobile/pair', 'Join a shared wallet'],
      ['/mobile/recover', 'Restore a shared wallet'],
      ['/mobile/watch', 'Import a desktop hardware wallet']
    ]) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Allow camera', exact: true }).click();
      await expect(page.getByText(/Camera access was denied/)).toBeVisible();
      await page.getByRole('button', { name: 'Try camera again', exact: true }).click();
      await expect(page.getByText(/Camera access was denied/)).toBeVisible();
      await capture(route.split('/').at(-1)!);
    }
  });
}

test('appearance controls stay synchronized after changing theme in Settings', async ({
  page
}, info) => {
  await page.goto('/settings');
  for (const theme of ['Dark', 'Light']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    if (info.project.name === 'desktop') {
      await expect(
        page.getByRole('button', { name: `Use ${theme.toLowerCase()} mode`, exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
    }
  }
});
