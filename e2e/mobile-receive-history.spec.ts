import { expect, test, type Page } from '@playwright/test';

const cases = [
  {
    name: 'a paired phone opening the generic Receive deep link',
    path: '/receive?fixture-selected-multisig=1',
    role: 'mobile_cosigner',
    watchOnly: false
  },
  {
    name: 'a watch-only shared wallet',
    path: '/multisig/receive?fixture-selected-multisig=1',
    role: 'mobile_watch_only',
    watchOnly: false
  },
  {
    name: 'a watch-only hardware wallet on iOS',
    path: '/receive',
    role: null,
    watchOnly: true
  }
];

async function setMobileFixture(
  page: Page,
  role: string | null,
  watchOnly: boolean,
  native: boolean
) {
  await page.route(/\/src\/lib\/wallet\/index\.ts(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const fixture = `
      const role = ${JSON.stringify(role)};
      walletService.coordinationStatus = async () => ({
        shared: role !== null,
        role,
        canSignOnThisDevice: role === 'mobile_cosigner',
        mobileSignerFingerprint: null,
        keyProtection: null
      });
      if (${watchOnly}) {
        const profiles = walletService.profiles.bind(walletService);
        walletService.profiles = async () => {
          const result = await profiles();
          return { ...result, wallets: result.wallets.map((wallet) =>
            wallet.id === result.selectedWalletId ? { ...wallet, kind: 'watch_only' } : wallet) };
        };
      }
      if (${native}) {
        const runtime = walletService.runtimePlatform.bind(walletService);
        walletService.runtimePlatform = async () => ({
          ...(await runtime()), mobile: true, platform: 'ios'
        });
      }
      window.receiveWrites = 0;
      for (const name of [
        'createAddress', 'createMultisigAddress', 'discardAddress', 'discardMultisigAddress'
      ]) {
        walletService[name] = async () => { window.receiveWrites += 1; };
      }
    `;
    await route.fulfill({ response, body: (await response.text()) + '\n' + fixture });
  });
}

for (const { name, path, role, watchOnly } of cases) {
  test(`keeps saved addresses read-only for ${name}`, async ({ page }) => {
    await setMobileFixture(page, role, watchOnly, watchOnly);
    await page.goto(path);
    if (role) await expect(page).toHaveURL(/\/multisig\/receive/);
    await expect(page.getByText('Receive on desktop', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /new (receive )?address|discard/i })).toHaveCount(
      0
    );
    await expect(page.getByRole('heading', { name: 'Address history' })).toBeVisible();
    await page.getByRole('button', { name: /^View July savings/ }).click();
    const awaiting = page.getByRole('dialog', { name: 'July savings', exact: true });
    await expect(awaiting.getByText('Awaiting payment', { exact: true })).toBeVisible();
    await awaiting.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'View details for Invoice #104' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Invoice #104', exact: true }).getByText('Payment received')
    ).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'receiveWrites'))).toBe(0);
  });
}

test('native mobile Policy keeps history and backup controls in landscape', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Checks the native phone landscape layout');
  await page.setViewportSize({ width: 844, height: 390 });
  await setMobileFixture(page, null, false, true);
  await page.goto('/multisig?fixture-policy-maturity=1');

  await expect(page.getByRole('link', { name: 'Address history', exact: true })).toHaveAttribute(
    'href',
    '/multisig/receive'
  );
  await expect(page.getByRole('link', { name: 'Receive', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More wallet actions' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show descriptors', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export & verify', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Recovery policy lab', exact: true })).toBeVisible();
});

test('mobile Policy shows only known balance values and respects discreet mode', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Checks the compact mobile Policy balance');
  const policy = '/multisig?fixture-selected-multisig=1';
  const mobileBalance = page.getByRole('group', { name: /^(Total|Unverified) balance$/ });
  await page.goto(policy);
  await expect(page.getByRole('group', { name: 'Total balance' })).toHaveText(/2,481,240\s*sats/);

  await page.goto(policy + '&fixture-initial-history-required=1&fixture-empty-wallet=1');
  await expect(page.getByRole('group', { name: 'Unverified balance' })).toHaveText(/0\s*sats/);

  await page.evaluate(() => localStorage.setItem('groot-discreet-mode', 'true'));
  await page.goto(policy);
  await expect(mobileBalance).toContainText('••••••');
  await expect(mobileBalance).not.toContainText('2,481,240');

  await page.goto(policy + '&fixture-initial-history-required=1');
  await expect(page.getByRole('heading', { name: 'Family wallet' })).toBeVisible();
  await expect(mobileBalance).toHaveCount(0);

  await page.goto(policy + '&fixture-policy-status-offline=1');
  await expect(page.getByText('Wallet data is unavailable')).toBeVisible();
  await expect(mobileBalance).toHaveCount(0);
});
