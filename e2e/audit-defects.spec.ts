import { expect, test } from '@playwright/test';

test('same-view Activity refresh retains history and retries without losing the cursor', async ({
  page
}) => {
  await page.goto('/activity?fixture-large-history=1');
  await expect(page.locator('.tx-row')).toHaveCount(50);
  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService, WalletError } = await import(path);
    const original = walletService.activity.bind(walletService);
    walletService.activity = async () => {
      walletService.activity = original;
      throw new WalletError('internal_error', 'Synthetic history refresh failure.');
    };
  });
  await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
  await expect(page.getByText('Transactions are unavailable', { exact: true })).toBeVisible();
  await expect(page.locator('.tx-row')).toHaveCount(50);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Transactions are unavailable', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.tx-row')).toHaveCount(100);
  await page.getByPlaceholder('Search labels').fill('history 119');
  await expect(page.locator('.tx-row')).toHaveCount(1);
  await expect(page.locator('.tx-row')).toContainText('Synthetic history 119');
});

test('tooltip trigger exposes its explanation and Escape dismisses it', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Import or export wallet labels/ }).click();
  const triggers = page.locator('.insight-tip button');
  const first = triggers.first();
  await expect(first).toBeVisible();
  // Programmatic click also exercises coarse-pointer activation without hover.
  await first.evaluate((element: HTMLButtonElement) => element.click());
  const id = await first.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  const tooltip = page.locator(`[id="${id}"]`);
  await expect(tooltip).toHaveAttribute('role', 'tooltip');
  await expect(tooltip).toBeVisible();
  await expect(first).toHaveAccessibleDescription(await tooltip.innerText());
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-expanded', 'false');
});

for (const [locale, button, error] of [
  ['fr', 'Scanner le QR de paiement Bitcoin', 'L’accès à la caméra a été refusé.'],
  ['es', 'Escanear QR de pago de Bitcoin', 'Se denegó el acceso a la cámara.']
]) {
  test(`camera denial is localized in ${locale}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('groot-language', value), locale);
    await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export default class { async start() { throw new DOMException('synthetic', 'NotAllowedError'); } destroy() {} }`
      })
    );
    await page.goto('/send');
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.locator('.scan-status')).toContainText(error);
    await expect(page.locator('.scan-status')).not.toContainText('Camera access was denied');
  });
}

test('accepted payment with failed local recording keeps the txid and blocks another payment', async ({
  page
}) => {
  await page.goto('/send?fixture-broadcast-record-error=1');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Synthetic recording failure');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('25000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: 'Continue to sign' }).click();
  await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment sent' })).toBeVisible();
  await expect(
    page.locator('.warning-notice').getByText('Local recording pending', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('Transaction ID', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make another payment' })).toBeDisabled();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', page.viewportSize()!.width);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.screenshot({
      path: test.info().outputPath(`recording-pending-${theme}.png`),
      scale: 'css'
    });
  }
});

test('UR scanner translates live counts and its bounded frame-limit failure', async ({ page }) => {
  await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export default class { constructor(_video, emit) { window.emitUrFrame = (data) => emit({ data }); } async start() {} stop() {} destroy() {} }`
    })
  );
  await page.goto('/multisig/send');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Payment label').fill('Synthetic scanner test');
  await page.getByRole('button', { name: 'Continue to amount' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('25000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    walletService.decodePsbtUr = async () => {
      throw new Error('Keep scanning');
    };
  });
  await page.getByRole('button', { name: 'Scan signed QR', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => typeof (window as Window & { emitUrFrame?: unknown }).emitUrFrame)
    )
    .toBe('function');
  await page.evaluate(() => {
    const emit = (window as Window & { emitUrFrame: (frame: string) => void }).emitUrFrame;
    emit('ur:crypto-psbt/1of1024/synthetic');
  });
  await expect(page.locator('.scan-status')).toContainText('1 unique frame scanned');
  await page.evaluate(() =>
    (window as Window & { emitUrFrame: (frame: string) => void }).emitUrFrame(
      'ur:crypto-psbt/2of1024/synthetic'
    )
  );
  await expect(page.locator('.scan-status')).toContainText('2 unique frames scanned');
  await page.evaluate(async () => {
    const path = '/src/lib/i18n.ts';
    const { locale } = await import(path);
    locale.set('fr');
  });
  await expect(page.locator('.scan-status')).toContainText('2 images uniques analysées');
  await page.evaluate(() => {
    const emit = (window as Window & { emitUrFrame: (frame: string) => void }).emitUrFrame;
    for (let frame = 3; frame <= 1025; frame++) emit(`ur:crypto-psbt/${frame}of1024/synthetic`);
  });
  await expect(page.locator('.scan-status')).toContainText('Trop d’images QR. Relancez l’analyse.');
});
