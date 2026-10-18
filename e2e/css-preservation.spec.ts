import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Opt-in capture/comparison keeps machine-specific evidence out of source control.
const evidence = process.env.CSS_EVIDENCE_DIR;
const baseline = process.env.CSS_BASELINE_DIR;
const varianceBaseline = process.env.CSS_VARIANCE_BASELINE_DIR ?? baseline;
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

for (const theme of ['light', 'dark']) {
  test(`${theme} CSS preservation evidence`, async ({ page }, info) => {
    test.skip(!evidence, 'Set CSS_EVIDENCE_DIR to capture the preservation matrix.');
    test.setTimeout(120000);
    await page.clock.setFixedTime(new Date('2026-10-18T12:00:00Z'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('groot-theme', value), theme);
    const directory = resolve(evidence!, info.project.name, theme);
    mkdirSync(directory, { recursive: true });
    for (const [index, route] of routes.entries()) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('.wallet-skeleton')).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        await document.fonts.load('400 14px "Source Sans 3"');
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const name = `${index}-${route.split('?')[0].replaceAll('/', '_') || 'overview'}`;
      // Capture first: WebKit can settle label/file-input grid sizing when the
      // compositor paints. Geometry must describe the frame we actually saved.
      await page.screenshot({
        path: resolve(directory, `${name}.png`),
        scale: 'css',
        animations: 'disabled'
      });
      const styles = await page.evaluate(() => {
        const properties = [
          'display',
          'position',
          'color',
          'backgroundColor',
          'borderColor',
          'borderRadius',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'padding',
          'margin',
          'gap',
          'gridTemplateColumns',
          'alignItems',
          'justifyContent',
          'overflow',
          'minHeight',
          'boxShadow',
          'zIndex'
        ];
        return Array.from(document.querySelectorAll('body *')).flatMap((element) => {
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height || element.closest('svg')) return [];
          const style = getComputedStyle(element);
          return [
            {
              tag: element.tagName,
              rect: [rect.x, rect.y, rect.width, rect.height].map(
                (value) => Math.round(value * 100) / 100
              ),
              ...Object.fromEntries(
                properties.map((property) => [
                  property,
                  style[property as keyof CSSStyleDeclaration]
                ])
              )
            }
          ];
        });
      });
      writeFileSync(resolve(directory, `${name}.json`), JSON.stringify(styles, null, 2) + '\n');
      if (baseline) {
        const expected = JSON.parse(
          readFileSync(resolve(baseline, info.project.name, theme, `${name}.json`), 'utf8')
        );
        // The original WebKit fixture has two observed unit gaps (logical vs
        // physical margin declarations, lazy CSS order). Check the original
        // observed envelope only for those three spacing measurements.
        if (route === '/multisig' && info.project.name === 'mobile') {
          const indices = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('body *')).filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width && rect.height && !element.closest('svg');
            });
            return ['.vault-hero .formatted-amount', '.vault-hero .formatted-amount small'].map(
              (selector) => elements.indexOf(document.querySelector(selector)!)
            );
          });
          const variants = ['light', 'dark'].map((value) =>
            JSON.parse(
              readFileSync(
                resolve(varianceBaseline!, info.project.name, value, `${name}.json`),
                'utf8'
              )
            )
          );
          for (const position of indices) {
            expect(position).toBeGreaterThanOrEqual(0);
            expect(variants.map((variant) => JSON.stringify(variant[position].rect))).toContain(
              JSON.stringify(styles[position].rect)
            );
            expect(variants.map((variant) => variant[position].margin)).toContain(
              styles[position].margin
            );
            expected[position].rect = styles[position].rect;
            expected[position].margin = styles[position].margin;
          }
        }
        const unpainted = await page.evaluate(() =>
          Array.from(document.querySelectorAll('body *'))
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width && rect.height && !element.closest('svg');
            })
            .flatMap((element, index) => {
              const details = element.closest('details:not([open])');
              const closedContent =
                details &&
                element !== details &&
                !details.querySelector('summary')?.contains(element);
              return closedContent ||
                (typeof element.checkVisibility === 'function' && !element.checkVisibility()) ||
                getComputedStyle(element).visibility === 'hidden'
                ? [index]
                : [];
            })
        );
        // Closed, unpainted detail content can expose stale UA colors/geometry.
        // Keep its raw evidence, but compare the actually rendered UI.
        expect(styles).toHaveLength(expected.length);
        expect
          .soft(
            styles.filter((_, index) => !unpainted.includes(index)),
            `${info.project.name}/${theme}/${route}`
          )
          .toEqual(expected.filter((_: unknown, index: number) => !unpainted.includes(index)));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        page.viewportSize()!.width
      );
    }
  });
}
