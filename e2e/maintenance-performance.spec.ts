import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Opt in: timings are observations, not flaky CI pass/fail thresholds.
test('records repeated browser-fixture route readiness and assets', async ({ page }, info) => {
  test.skip(process.env.GROOT_MEASURE_FRONTEND !== '1', 'Opt-in performance observation');
  const samples = [];
  await page.addInitScript(() => {
    const selectors: Record<string, string> = {
      '/': '.balance-card',
      '/send': '.send-signers',
      '/multisig/send': '.send-page',
      '/settings': '.settings-group'
    };
    const selector = selectors[location.pathname];
    if (!selector) return;
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element || !element.getClientRects().length) return;
      performance.mark('groot-route-ready');
      observer.disconnect();
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true });
  });
  for (const [route, ready] of [
    ['/', '.balance-card'],
    ['/send', '.send-signers'],
    ['/multisig/send', '.send-page'],
    ['/settings', '.settings-group']
  ] as const) {
    for (let repeat = 0; repeat < 3; repeat++) {
      await page.goto(route);
      await expect(page.locator(ready).first()).toBeVisible();
      await page.waitForFunction(
        () => performance.getEntriesByName('groot-route-ready').length > 0
      );
      samples.push({
        route,
        repeat,
        viewport: page.viewportSize(),
        ...(await page.evaluate(() => ({
          readyMs: performance.getEntriesByName('groot-route-ready')[0].startTime,
          resources: performance
            .getEntriesByType('resource')
            .map((entry) => ({ name: new URL(entry.name).pathname, duration: entry.duration }))
        })))
      });
    }
  }
  const measurementPath = info.outputPath('browser-route-measurements.json');
  await writeFile(
    measurementPath,
    JSON.stringify(
      {
        kind: 'vite-browser-fixture',
        method:
          'full document navigation; first matching DOM surface, not native data or hardware readiness',
        samples
      },
      null,
      2
    )
  );
  await info.attach('browser-route-measurements', {
    path: measurementPath,
    contentType: 'application/json'
  });
});

test('Miniscript compatibility is visible before setup in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/multisig/new');
    await page.evaluate((value) => localStorage.setItem('groot-theme', value), theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByText('Miniscript signer compatibility', { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        /Coldcard and Trezor are unsupported for delayed policies through this integration/
      )
    ).toBeVisible();
    await expect(page.getByText(/Phone pairing supports standard multisig only/)).toBeVisible();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', page.viewportSize()!.width);
    await page
      .getByText('Miniscript signer compatibility', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`miniscript-compatibility-${theme}.png`)
    });
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await next.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' })
    );
    await next.focus();
    await expect(next).toBeFocused();
    const bounds = await next.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({ path: test.info().outputPath(`miniscript-actions-${theme}.png`) });
  }
});
