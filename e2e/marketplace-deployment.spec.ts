import { test, expect } from '@playwright/test';

test.skip(
  process.env.GROOT_MARKETPLACE_DEPLOYMENT !== '1',
  'Requires the private TLS deployment verifier.'
);

test('the packaged sandbox has no wallet chrome and blocks client-side wallet/discovery navigation', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/marketplace/backend');
  await expect(page.getByRole('heading', { name: 'Trade bitcoin', exact: true })).toBeVisible();
  for (const name of ['Settings', 'Overview', 'Send', 'Coins', 'Activity'])
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  const appEntry = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((entry) => entry.src)
  );
  expect(appEntry.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  // Use actual SvelteKit navigation through its rendered link handling, bypassing HTTP route probes.
  for (const path of ['/settings', '/send', '/coins', '/marketplace/discover', '/']) {
    await page.evaluate(async (href) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = 'Forbidden navigation fixture';
      link.id = 'forbidden-navigation-fixture';
      document.body.appendChild(link);
      link.click();
      link.remove();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, path);
    await expect(page).toHaveURL(/\/marketplace\/backend$/);
    await expect(page.getByRole('heading', { name: 'Trade bitcoin', exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
