import { expect, test } from '@playwright/test';

const address = 'bcrt1qreceiver0000000000000000000000000000000';

for (const multisig of [false, true]) {
  test(`${multisig ? 'multisig' : 'software'} saved payment opens without new fee or coin reads`, async ({
    page
  }) => {
    await page.goto(multisig ? '/multisig/send?fixture-selected-multisig=1' : '/send');
    await page.getByLabel('Bitcoin address').fill(address);
    await page.getByLabel('Payment label').fill('Synthetic saved payment');
    await page.getByRole('button', { name: 'Continue to amount' }).click();
    await page.getByLabel('Amount', { exact: true }).fill('8000');
    await page.getByRole('button', { name: 'Review payment' }).click();
    await expect(page.getByText('Network fee', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    const resume = page.getByRole('link', { name: /Resume payment, Synthetic saved payment/ });
    await expect(resume).toBeVisible();

    await page.evaluate(async (isMultisig) => {
      const path = '/src/lib/wallet/index.ts';
      const { walletService } = await import(path);
      const calls = { fees: 0, coins: 0 };
      Object.assign(window, { sendResumeCalls: calls });
      walletService.estimateFees = () => {
        calls.fees += 1;
        return new Promise(() => undefined);
      };
      const method = isMultisig ? 'multisigSnapshot' : 'snapshot';
      const original = walletService[method].bind(walletService);
      walletService[method] = () => {
        calls.coins += 1;
        return original();
      };
    }, multisig);

    await resume.click();
    await expect(page.getByText('Network fee', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Bitcoin address')).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { sendResumeCalls?: { fees: number; coins: number } }).sendResumeCalls
      )
    ).toEqual({ fees: 0, coins: 0 });

    if (!multisig) {
      await page.evaluate(async () => {
        const path = '/src/lib/wallet/index.ts';
        const { walletService } = await import(path);
        walletService.estimateFees = async () => ({ economy: 1, standard: 2, priority: 5 });
      });
      await page.getByRole('button', { name: 'Continue to sign' }).click();
      await page.getByLabel('Wallet passphrase', { exact: true }).fill('prototype-passphrase');
      await page.getByRole('button', { name: /Sign & broadcast/ }).click();
      await expect(page.getByRole('heading', { name: 'Payment sent' })).toBeVisible();
      await page.getByRole('button', { name: 'Make another payment' }).click();
      await expect(page).toHaveURL(/\/send$/);
      await page.getByLabel('Bitcoin address').fill(address);
      await page.getByLabel('Payment label').fill('Synthetic second payment');
      await page.getByRole('button', { name: 'Continue to amount' }).click();
      await page.getByLabel('Amount', { exact: true }).fill('9000');
      await expect(page.getByRole('button', { name: /^Standard/ })).toContainText('2 sat/vB');
      await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
    }
  });

  for (const rate of [7, 0]) {
    test(`${multisig ? 'multisig' : 'software'} compose opens during fee lookup and keeps entered rate ${rate}`, async ({
      page
    }) => {
      await page.goto(multisig ? '/multisig?fixture-selected-multisig=1' : '/');
      const send = page.getByRole('link', { name: 'Send', exact: true });
      await expect(send).toBeVisible();
      await page.evaluate(async () => {
        const path = '/src/lib/wallet/index.ts';
        const { walletService } = await import(path);
        walletService.estimateFees = () =>
          new Promise((resolve) => {
            Object.assign(window, {
              finishSendFees: () =>
                resolve({ economy: 1, standard: 2, priority: 5, source: 'Regtest policy' })
            });
          });
      });

      await send.click();
      await page.getByLabel('Bitcoin address').fill(address);
      await page.getByLabel('Payment label').fill('Synthetic new payment');
      await page.getByRole('button', { name: 'Continue to amount' }).click();
      await page.getByLabel('Amount', { exact: true }).fill('8000');
      const standard = page.getByRole('button', { name: /^Standard/ });
      await expect(standard).toContainText('Loading…');
      await expect(standard).toBeDisabled();
      const customRate = page.getByRole('textbox', { name: 'Custom fee rate' });
      await customRate.fill(String(rate));

      await page.evaluate(() =>
        (window as Window & { finishSendFees: () => void }).finishSendFees()
      );
      await expect(standard).toBeEnabled();
      await expect(customRate).toHaveValue(String(rate));
      const review = page.getByRole('button', { name: 'Review payment' });
      if (rate > 0) {
        await expect(page.locator('.fee-source .formatted-amount strong')).toHaveText(
          multisig ? '1,540' : '987'
        );
        await expect(review).toBeEnabled();
      } else {
        await expect(review).toBeDisabled();
      }
    });
  }
}
