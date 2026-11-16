import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectContainedPairingLayout(
  page: Page,
  dialog: Locator,
  scrollRegion: Locator,
  footer: Locator,
  qr: Locator
) {
  await expect(dialog).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(qr).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {}))
    );
  });

  const viewport = page.viewportSize();
  const dialogBounds = await dialog.boundingBox();
  const footerBounds = await footer.boundingBox();
  const qrBounds = await qr.boundingBox();
  expect(viewport && dialogBounds && footerBounds && qrBounds).toBeTruthy();
  expect(dialogBounds!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.y + dialogBounds!.height).toBeLessThanOrEqual(viewport!.height);
  expect(footerBounds!.y + footerBounds!.height).toBeLessThanOrEqual(
    dialogBounds!.y + dialogBounds!.height
  );
  expect(qrBounds!.width).toBeLessThanOrEqual(342);
  expect(qrBounds!.x).toBeGreaterThanOrEqual(dialogBounds!.x);
  expect(qrBounds!.x + qrBounds!.width).toBeLessThanOrEqual(dialogBounds!.x + dialogBounds!.width);
  await expect(scrollRegion).toHaveCSS('overflow-y', 'auto');

  const footerY = footerBounds!.y;
  if (await scrollRegion.evaluate((element) => element.scrollHeight > element.clientHeight)) {
    await scrollRegion.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect((await footer.boundingBox())?.y).toBe(footerY);
  }
}

test('phone pairing QR actions remain visible outside the scroll area', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [] }) }
    });
  });
  await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export default class {
        constructor(_video, emit) {
          window.emitDesktopPhoneFrame = () => emit({ data: 'ur:groot-bsms/layout-response' });
        }
        async start() {}
        stop() {}
        destroy() {}
      }`
    })
  );

  await page.goto('/multisig/new');
  const configure = page.getByRole('button', { name: 'Continue', exact: true });
  const walletName = page.getByLabel('Wallet name');
  await configure.or(walletName).first().waitFor();
  if (await configure.isVisible()) await configure.click();
  await walletName.fill('Phone layout vault');
  await page.getByRole('button', { name: 'Continue to signers' }).click();

  await page.evaluate(async () => {
    const modulePath = '/src/lib/wallet/index.ts';
    const { walletService } = await import(/* @vite-ignore */ modulePath);
    walletService.createPairingInvitation = async () => ({
      sessionId: 'layout-session',
      expiresAt: Date.now() + 60_000,
      comparisonCode: '482 731',
      frames: ['ur:groot-bsms/layout-invitation']
    });
    walletService.acceptMobileSigner = async () => ({
      id: 'layout-phone',
      label: 'Family phone',
      fingerprint: 'faceb00c',
      xpub: 'tpubD6NzVbkrYhZ4Y-e2e-phone-public-key',
      derivationPath: "m/48'/1'/0'/2'",
      source: 'qr',
      deviceType: 'groot-mobile'
    });
    walletService.finalizePairingOnDesktop = async () => ['ur:groot-bsms/layout-final-policy'];
  });

  await page.getByRole('button', { name: 'Add a signer' }).click();
  await page.getByRole('button', { name: 'Add a Groot phone' }).click();
  const invitation = page.getByRole('dialog', { name: 'Add a Groot phone' });
  await expectContainedPairingLayout(
    page,
    invitation,
    invitation.getByTestId('desktop-phone-pairing-scroll'),
    invitation.getByTestId('desktop-phone-pairing-footer'),
    invitation.getByRole('img', { name: /Groot phone invitation QR frame/ })
  );
  await expect(invitation.getByRole('button', { name: 'Scan phone QR code' })).toBeVisible();

  await invitation.getByRole('button', { name: 'Scan phone QR code' }).click();
  await invitation.getByRole('button', { name: 'Allow camera', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as Window & { emitDesktopPhoneFrame?: unknown }).emitDesktopPhoneFrame
      )
    )
    .toBe('function');
  await page.evaluate(() =>
    (window as Window & { emitDesktopPhoneFrame: () => void }).emitDesktopPhoneFrame()
  );
  await invitation.getByRole('button', { name: 'Six digits match — add signer' }).click();
  await invitation.getByRole('button', { name: 'Continue wallet setup' }).click();

  for (const signer of [
    {
      label: 'Desk signer',
      fingerprint: 'a1b2c3d4',
      xpub: 'tpubD6NzVbkrYhZ4Y-e2e-desk-public-key'
    },
    {
      label: 'Backup signer',
      fingerprint: 'b1b2c3d4',
      xpub: 'tpubD6NzVbkrYhZ4Y-e2e-backup-public-key'
    }
  ]) {
    await page.getByRole('button', { name: 'Add a signer' }).click();
    await page.getByRole('button', { name: 'Enter public key' }).click();
    await page.getByLabel('Signer label').fill(signer.label);
    await page.getByLabel('Master fingerprint').fill(signer.fingerprint);
    await page.getByLabel('Account xpub').fill(signer.xpub);
    await page.getByRole('button', { name: 'Add key' }).click();
  }

  await page.getByRole('button', { name: 'Review wallet' }).click();
  await page.getByRole('button', { name: 'Continue to backup' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save public descriptor text|Save another copy/ }).click();
  await download;
  await page.getByLabel('App PIN', { exact: true }).fill('layout-test-pin');
  await page.getByLabel('Confirm app PIN', { exact: true }).fill('layout-test-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();

  const finalPolicy = page.getByRole('dialog', { name: 'Finish pairing on the phone' });
  const finalFooter = finalPolicy.getByTestId('final-phone-pairing-footer');
  await expectContainedPairingLayout(
    page,
    finalPolicy,
    finalPolicy.getByTestId('final-phone-pairing-scroll'),
    finalFooter,
    finalPolicy.getByRole('img', { name: /Final shared wallet policy QR frame/ })
  );
  const accepted = finalFooter.getByRole('button', { name: 'Phone accepted the wallet' });
  await expect(accepted).toBeVisible();
  const acceptedBounds = await accepted.boundingBox();
  const viewport = page.viewportSize();
  expect(acceptedBounds && viewport).toBeTruthy();
  expect(acceptedBounds!.y + acceptedBounds!.height).toBeLessThanOrEqual(viewport!.height);
  await finalPolicy.screenshot({
    path: test.info().outputPath('final-phone-pairing-modal.png'),
    animations: 'disabled'
  });
});
