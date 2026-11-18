import { expect, test } from '@playwright/test';

test('explicit lock hides wallet details immediately and awaits the native lock', async ({
  page
}) => {
  await page.goto('/settings');
  const lockButton = page.getByRole('button', { name: /Lock Everyday wallet now/ });
  await expect(lockButton).toBeVisible();

  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    const calls = { syncCancel: 0, hardwareCancel: 0, lock: 0 };
    Object.assign(window, { walletLockCalls: calls });
    walletService.cancelSync = async () => {
      calls.syncCancel += 1;
    };
    walletService.cancelHardwareOperations = () => {
      calls.hardwareCancel += 1;
      return new Promise((_resolve, reject) => {
        Object.assign(window, {
          failHardwareCleanup: () => reject(new Error('Hardware cleanup timed out.'))
        });
      });
    };
    const lock = walletService.lock.bind(walletService);
    walletService.lock = async () => {
      calls.lock += 1;
      await new Promise<void>((resolve) => {
        Object.assign(window, { finishWalletLock: resolve });
      });
      await lock();
    };
  });

  const calls = () =>
    page.evaluate(() => (window as Window & { walletLockCalls?: object }).walletLockCalls);
  const locking = page.getByRole('status').filter({ hasText: 'Locking wallet…' });
  const unlockButton = page.getByRole('button', { name: 'Unlock wallet', exact: true });
  await lockButton.click();
  await expect(locking).toBeVisible();
  await expect(lockButton).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Everyday wallet settings' })).toHaveCount(0);
  await expect(unlockButton).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);
  await expect.poll(calls).toEqual({ syncCancel: 1, hardwareCancel: 1, lock: 0 });

  await page.evaluate(() => {
    (window as Window & { failHardwareCleanup: () => void }).failHardwareCleanup();
  });
  await expect.poll(calls).toEqual({ syncCancel: 1, hardwareCancel: 1, lock: 1 });
  await expect(locking).toBeVisible();
  await expect(unlockButton).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);

  await page.evaluate(() => {
    (window as Window & { finishWalletLock: () => void }).finishWalletLock();
  });
  await expect(page).toHaveURL(/\/unlock$/);
  await expect(unlockButton).toBeVisible();
  await expect(page.getByText('Could not stop hardware operation', { exact: true })).toBeVisible();
  await expect(locking).toHaveCount(0);
});
