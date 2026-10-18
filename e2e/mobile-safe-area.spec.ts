import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ video: process.env.IOS_LAYOUT_EVIDENCE_DIR ? 'on' : 'retain-on-failure' });

for (const theme of ['light', 'dark']) {
  for (const landscape of [false, true]) {
    test(`${theme} welcome ${landscape ? 'landscape' : 'portrait'} safe layout`, async ({
      page
    }, info) => {
      if (landscape) await page.setViewportSize({ width: 844, height: 390 });
      await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
      await page.goto('/welcome?fixture-empty=1');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const settings = page.getByRole('link', { name: 'Settings', exact: true });
      await expect(settings).toBeVisible();
      const mobile = info.project.name === 'mobile';
      if (mobile) {
        await expect(page.locator('.onboarding-brand-lockup')).toBeHidden();
        const frame = await settings.boundingBox();
        expect(frame!.width).toBeGreaterThanOrEqual(44);
        expect(frame!.height).toBeGreaterThanOrEqual(44);
      } else await expect(page.locator('.onboarding-brand-lockup')).toBeVisible();
      await expect(page.locator('.hero-mark')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toContain(
        'user-scalable=no'
      );
      if (process.env.IOS_LAYOUT_EVIDENCE_DIR) {
        const directory = resolve(process.env.IOS_LAYOUT_EVIDENCE_DIR, info.project.name);
        mkdirSync(directory, { recursive: true });
        await page.screenshot({
          path: resolve(directory, `${theme}-${landscape ? 'landscape' : 'portrait'}.png`)
        });
      }
      await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Choose your wallet', exact: true })
      ).toBeVisible();
      await expect(page.locator('.onboarding-brand-lockup')).toBeVisible();
      await settings.click();
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    });
  }
}
