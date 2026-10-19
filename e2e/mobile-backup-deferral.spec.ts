import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ video: process.env.MOBILE_KEY_EVIDENCE_DIR ? 'on' : 'retain-on-failure' });

for (const theme of ['light', 'dark']) {
  test(`${theme} deferred phone backup survives pairing and can be verified later`, async ({
    page
  }, info) => {
    await page.addInitScript((value) => {
      localStorage.setItem('groot-theme', value);
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [] }) }
      });
    }, theme);
    await page.route(/\/qr-scanner\.js(?:\?|$)/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export default class { constructor(_video, emit) { window.emitPhoneFrame = (frame = "ur:groot-invite/synthetic") => emit({ data: frame }); } async start() {} stop() {} destroy() {} }'
      })
    );
    await page.goto('/mobile/pair');
    await page.evaluate(async () => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService, WalletError } = await import(path);
      walletService.decodePairingInvitation = async () => ({
        invitationJson: JSON.stringify({
          walletName: 'Synthetic family',
          network: 'regtest',
          threshold: 2,
          signerCount: 3
        }),
        comparisonCode: '123456'
      });
      walletService.acceptPairingOnMobile = async () => ({
        sessionId: 'synthetic-session',
        fingerprint: 'abcd1234',
        xpubChecksum: 'synthetic',
        backupVerified: false,
        comparisonCode: '123456',
        frames: ['ur:bytes/synthetic'],
        awaitingFinalPolicy: false
      });
      const multisigWallet = walletService.multisigWallet.bind(walletService);
      walletService.multisigWallet = async () => {
        const wallet = await multisigWallet();
        return (
          wallet && {
            ...wallet,
            cosigners: wallet.cosigners.map((signer: object, index: number) =>
              index === 0
                ? {
                    ...signer,
                    label: 'Synthetic phone',
                    fingerprint: 'abcd1234',
                    deviceType: 'groot-mobile',
                    source: 'qr'
                  }
                : signer
            )
          }
        );
      };
      walletService.awaitFinalPairingPolicy = async () => {};
      walletService.inspectFinalPairingOnMobile = async () => 'synthetic-session';
      walletService.completePairingOnMobile = async (_frames: string[], credential: string) => {
        if (credential !== 'synthetic-correct-pin')
          throw new WalletError('invalid_credential', 'Incorrect app PIN.');
      };
      walletService.coordinationStatus = async () => ({
        shared: true,
        role: 'mobile_cosigner',
        canSignOnThisDevice: true,
        mobileSignerFingerprint: 'abcd1234',
        keyProtection: 'synthetic-only'
      });
      const profiles = walletService.profiles.bind(walletService);
      walletService.profiles = async () => {
        const registry = await profiles();
        return {
          ...registry,
          wallets: registry.wallets.map((profile: { backupVerified: boolean }) => ({
            ...profile,
            backupVerified: false
          }))
        };
      };
      let attempts = 0;
      walletService.verifyBackup = async (credential: string) => {
        if (credential !== 'synthetic-correct-pin')
          throw new WalletError('invalid_credential', 'Incorrect app PIN.');
        attempts += 1;
        return attempts > 1;
      };
    });
    const capture = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      if (!process.env.MOBILE_KEY_EVIDENCE_DIR) return;
      const directory = resolve(process.env.MOBILE_KEY_EVIDENCE_DIR, info.project.name);
      mkdirSync(directory, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        path: resolve(directory, `${theme}-${name}.png`),
        fullPage: true
      });
    };
    await page.getByRole('button', { name: 'Allow camera', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => typeof (window as Window & { emitPhoneFrame?: unknown }).emitPhoneFrame)
      )
      .toBe('function');
    await page.evaluate(() => (window as Window & { emitPhoneFrame: () => void }).emitPhoneFrame());
    await page.getByLabel('Local app PIN', { exact: true }).fill('synthetic-correct-pin');
    await page.getByLabel('Confirm PIN', { exact: true }).fill('synthetic-correct-pin');
    await page.getByRole('button', { name: 'Create phone key', exact: true }).click();
    await expect(page.getByText('Recovery backup not verified', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /Encrypted mobile signer QR/ })).toBeVisible();
    await capture('pairing-backup-deferred');
    await page.getByLabel('Local app PIN', { exact: true }).fill('synthetic-correct-pin');
    await page.getByRole('button', { name: 'Desktop scanned this phone key', exact: true }).click();
    await page.getByRole('button', { name: 'Allow camera', exact: true }).click();
    await expect(page.locator('.scanner')).toHaveClass(/camera-active/);
    await page.evaluate(() =>
      (window as Window & { emitPhoneFrame: (frame: string) => void }).emitPhoneFrame(
        'ur:groot-wallet/synthetic'
      )
    );
    await expect(page.getByText('QR verified', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Animated QR camera preview')).toHaveCount(0);
    await expect(page.locator('.scan-progress')).toHaveCount(0);
    await capture('final-qr-verified-before-pin');
    await page.getByLabel('Local app PIN', { exact: true }).fill('synthetic-wrong-pin');
    await page.getByRole('button', { name: 'Accept wallet policy', exact: true }).click();
    await expect(page.locator('.inline-error')).toHaveText('Incorrect app PIN.');
    await expect(page.getByLabel('Local app PIN', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Animated QR camera preview')).toHaveCount(0);
    await page.getByLabel('Local app PIN', { exact: true }).fill('synthetic-correct-pin');
    await page.getByRole('button', { name: 'Accept wallet policy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Family wallet', exact: true })).toBeVisible();
    const reminder = page.getByText('Recovery backup not verified', { exact: true });
    await expect(reminder).toBeVisible();
    await page.getByRole('button', { name: 'Verify now', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Verify phone recovery backup' });
    await dialog.getByLabel('App PIN', { exact: true }).fill('synthetic-wrong-pin');
    await dialog.getByRole('button', { name: 'Verify now', exact: true }).click();
    await expect(dialog.getByText('Incorrect app PIN.', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('App PIN', { exact: true })).toHaveValue('');
    await dialog.getByLabel('App PIN', { exact: true }).fill('synthetic-correct-pin');
    await dialog.getByRole('button', { name: 'Verify now', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Backup still unverified');
    await expect(reminder).toBeVisible();
    await dialog.getByRole('button', { name: 'Verify later', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await capture('shared-wallet-backup-reminder');
    await page.getByRole('button', { name: 'Verify now', exact: true }).click();
    await dialog.getByLabel('App PIN', { exact: true }).fill('synthetic-correct-pin');
    await dialog.getByRole('button', { name: 'Verify now', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(reminder).toHaveCount(0);
    await expect(page.locator('.coordinator-page').getByRole('status')).toHaveText(
      'Recovery backup verified'
    );
    await capture('phone-backup-verified');
    await page.getByRole('button', { name: 'View Synthetic phone details', exact: true }).click();
    const signerDialog = page.getByRole('dialog');
    await expect(
      signerDialog.locator('.connection-detail').getByText('QR connection', { exact: true })
    ).toBeVisible();
    await expect(signerDialog.getByText('USB connection needed', { exact: true })).toHaveCount(0);
    await capture('phone-qr-connection-details');
  });
}
