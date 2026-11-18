import { expect, test } from '@playwright/test';

test('Overview paints committed data without waiting for pairing or checking the node', async ({
  page
}) => {
  await page.goto('/activity');
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();

  const reads = () =>
    page.evaluate(() => (window as Window & { overviewReads?: object }).overviewReads);

  await page.evaluate(async () => {
    const path = '/src/lib/wallet/index.ts';
    const { walletService } = await import(path);
    const calls = { pairings: 0, nodeSetup: 0, nodeTests: 0, syncs: 0 };
    Object.assign(window, { overviewReads: calls });
    walletService.pendingMobilePairings = () => {
      calls.pairings += 1;
      return new Promise((resolve) => {
        Object.assign(window, { finishOverviewPairings: () => resolve([]) });
      });
    };
    const networkSetupSources = walletService.networkSetupSources.bind(walletService);
    walletService.networkSetupSources = () => {
      calls.nodeSetup += 1;
      return networkSetupSources();
    };
    const testNodeConnection = walletService.testNodeConnection.bind(walletService);
    walletService.testNodeConnection = () => {
      calls.nodeTests += 1;
      return testNodeConnection();
    };
    const sync = walletService.sync.bind(walletService);
    walletService.sync = (...args: Parameters<typeof sync>) => {
      calls.syncs += 1;
      return sync(...args);
    };
  });

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect.poll(reads).toEqual({ pairings: 1, nodeSetup: 0, nodeTests: 0, syncs: 0 });
  await expect(page.getByText('Total balance', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checking node…' })).toHaveCount(0);

  await page.evaluate(() => {
    (window as Window & { finishOverviewPairings: () => void }).finishOverviewPairings();
  });
});
