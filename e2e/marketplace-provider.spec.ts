import { expect, test } from '@playwright/test';

const api = '/api/marketplace/localcoinswap';
const sellTrade = '91e1dc0f-1fc8-4232-9d7b-0f3aee06b002';

test.skip(process.env.GROOT_LOCALCOINSWAP_MODE !== 'fixture', 'Provider fixture server required.');

test('reviews offers and transactions, recovers chat writes, and follows dispute updates', async ({
  page,
  baseURL
}, testInfo) => {
  test.setTimeout(45_000);
  if (!baseURL) throw new Error('The provider rehearsal requires an owned loopback server.');
  const origin = new URL(baseURL).origin;
  const tradePath = `${api}/trades/${sellTrade}`;
  const matchesChat = (url: URL) =>
    url.origin === origin && url.pathname === `${tradePath}/messages`;
  const external: string[] = [];
  await page.context().route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(new URL(route.request().url()).origin);
    await route.abort();
  });
  await page.goto('/marketplace/provider');
  await expect(page.getByRole('heading', { name: 'Trade bitcoin', level: 1 })).toBeVisible();
  await expect(page.getByText('Practice mode', { exact: true })).toBeVisible();
  await expect(page.getByText(/interactive prototype/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Trading terms', exact: true }).click();
  const terms = page.getByRole('dialog', { name: 'Trading terms' });
  await expect(terms).toContainText('LocalCoinSwap');
  await expect(terms.getByRole('link', { name: 'Terms of service', exact: true })).toHaveAttribute(
    'href',
    'https://localcoinswap.com/terms-of-service'
  );
  await expect(terms.getByRole('link', { name: 'Privacy policy', exact: true })).toHaveAttribute(
    'href',
    'https://localcoinswap.com/privacy'
  );
  expect(page.context().pages()).toEqual([page]);
  expect(external).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('07-trading-terms.png'), fullPage: true });
  await terms.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(terms).toBeHidden();

  const offers = (url: URL) => url.origin === origin && url.pathname === api + '/offers';
  await page.route(offers, (route) => route.abort('failed'), { times: 1 });
  const amount = page.getByLabel('Amount (EUR)', { exact: true });
  await amount.fill('125');
  const search = page.getByRole('button', { name: 'Find offers', exact: true });
  await search.click();
  await expect(page.getByRole('alert')).toContainText(
    'The trading service is temporarily unavailable.'
  );
  await search.click();
  const review = page.getByRole('button', { name: 'Review offer', exact: true }).first();
  await expect(review).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('00-offers.png'), fullPage: true });
  await review.click();
  await expect(
    page.getByText('Starting new trades is unavailable in this preview.', { exact: true })
  ).toBeVisible();
  await expect(search).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('01-offer-review.png'), fullPage: true });
  await page.getByRole('button', { name: 'Back to offers', exact: true }).click();
  await expect(amount).toHaveValue('125');
  await expect(review).toBeVisible();

  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trading transactions' })).toBeVisible();
  const transactionCard = (name: string) =>
    page.locator('section.instruction-card').filter({
      has: page.getByRole('heading', { name, exact: true })
    });
  const release = transactionCard('Escrow release');
  const withdrawal = transactionCard('Withdrawal');
  const deposit = transactionCard('Deposit');
  await expect(release).toContainText('125,000');
  await expect(release).toContainText('Confirmed');
  await expect(withdrawal).toContainText('-50,000');
  await expect(withdrawal).toContainText('Pending');
  await expect(deposit).toContainText('200,000');
  await expect(deposit).toContainText('Confirmed');
  await expect(withdrawal.getByText('Transaction ID', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/fixture-transaction-address|fixture-transaction-secret/)
  ).toHaveCount(0);
  const txid = release.getByText('7'.repeat(64), { exact: true });
  const disclose = release.getByText('Transaction ID', { exact: true });
  await expect(txid).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath('08-trading-transactions.png'),
    fullPage: true
  });
  await disclose.click();
  await expect(txid).toBeVisible();
  await disclose.click();
  await expect(txid).toBeHidden();

  await page.getByRole('button', { name: 'Your trades', exact: true }).click();
  const list = page.waitForResponse((response) => response.url().includes(api + '/trades?'));
  await page.getByRole('button', { name: 'Load trades', exact: true }).click();
  const tradeList = await (await list).json();
  const index = tradeList.data.items.findIndex((item: { id: string }) => item.id === sellTrade);
  expect(index).toBeGreaterThanOrEqual(0);
  const viewTrade = page.getByRole('button', { name: 'View trade', exact: true });
  await viewTrade.nth(index).click();
  await expect(viewTrade).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Payment marked sent', exact: true })
  ).toBeVisible();
  const chat = page.getByRole('list', { name: 'Trade chat' });
  await expect(chat.getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh messages', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('02-trade-chat.png'), fullPage: true });

  const width = page.viewportSize()?.width ?? 0;
  const message = `Fixture reply recovery ${width}`;
  let committed = 0;
  await page.route(matchesChat, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    committed++;
    await route.abort('failed');
  });
  await page.getByLabel('Message', { exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'The request may have reached the trading service.'
  );
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Check request', exact: true }).click();
  await expect(
    page.getByRole('status').and(page.getByText('Request confirmed.', { exact: true }))
  ).toBeVisible();
  await expect(chat.getByText(message, { exact: true })).toHaveCount(1);
  expect(committed).toBe(1);
  await page.unroute(matchesChat);

  const retriedMessage = `Fixture safe retry ${width}`;
  const attempts: { key: string; body: string | null }[] = [];
  await page.route(matchesChat, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    attempts.push({ key: request.headers()['idempotency-key'], body: request.postData() });
    if (attempts.length === 1) return route.abort('failed');
    return route.continue();
  });
  await page.getByLabel('Message', { exact: true }).fill(retriedMessage);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'The request may have reached the trading service.'
  );
  await page.getByRole('button', { name: 'Check request', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Retry request', exact: true });
  await expect(retry).toBeVisible();
  await expect(chat.getByText(retriedMessage, { exact: true })).toHaveCount(0);
  await retry.click();
  await expect(chat.getByText(retriedMessage, { exact: true })).toHaveCount(1);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(attempts[0].body).toBe(JSON.stringify({ content: retriedMessage }));
  expect(attempts[1]).toEqual(attempts[0]);
  await page.unroute(matchesChat);

  await page.getByRole('button', { name: 'Open dispute', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Open dispute' });
  await dialog.getByLabel('Describe the dispute').fill('Fixture payment needs review.');
  await page.screenshot({ path: testInfo.outputPath('03-open-dispute.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Disputed', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('04-disputed.png'), fullPage: true });
  await page.getByRole('button', { name: 'Withdraw dispute', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Withdraw dispute' });
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Payment marked sent', exact: true })
  ).toBeVisible();

  const externalMessage = `Update from another session ${width}`;
  const headers = () => ({
    Origin: origin,
    'X-Groot-LocalCoinSwap': '1',
    'Idempotency-Key': crypto.randomUUID()
  });
  const updatedChat = await page.request.post(`${origin}${tradePath}/messages`, {
    headers: headers(),
    data: { content: externalMessage }
  });
  expect(updatedChat.status()).toBe(201);
  const updatedStatus = await page.request.post(`${origin}${tradePath}/actions`, {
    headers: headers(),
    data: {
      action: 'open_dispute',
      expectedStatus: 'FUND_PAID',
      description: 'Fixture update from another session.'
    }
  });
  expect(updatedStatus.status()).toBe(200);
  await expect(chat.getByText(externalMessage, { exact: true })).toHaveCount(1, {
    timeout: 10_000
  });
  await expect(page.getByRole('heading', { name: 'Disputed', exact: true })).toBeVisible({
    timeout: 10_000
  });
  const restored = await page.request.post(`${origin}${tradePath}/actions`, {
    headers: headers(),
    data: { action: 'withdraw_dispute', expectedStatus: 'DISPUTED' }
  });
  expect(restored.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Payment marked sent', exact: true })).toBeVisible(
    { timeout: 10_000 }
  );

  const batchMessage = (index: number) => `Long chat fixture ${width} · ${index}`;
  for (let index = 0; index <= 20; index++) {
    const posted = await page.request.post(`${origin}${tradePath}/messages`, {
      headers: headers(),
      data: { content: batchMessage(index) }
    });
    expect(posted.status()).toBe(201);
  }
  await expect(chat.getByText(batchMessage(20), { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(chat.getByRole('listitem')).toHaveCount(20);
  await expect(chat.getByText(batchMessage(0), { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Earlier messages', exact: true }).click();
  await expect(chat.getByText(batchMessage(0), { exact: true })).toBeVisible();
  await expect(chat.getByText(batchMessage(20), { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Latest messages', exact: true }).click();
  await expect(chat.getByText(batchMessage(20), { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Back to trades', exact: true }).click();
  await expect(chat).toHaveCount(0);
  await expect(viewTrade).toHaveCount(tradeList.data.items.length);
  await page.screenshot({ path: testInfo.outputPath('05-active-trades.png'), fullPage: true });
  const requestedIndex = tradeList.data.items.findIndex(
    (item: { status: string }) => item.status === 'CREATED'
  );
  expect(requestedIndex).toBeGreaterThanOrEqual(0);
  await viewTrade.nth(requestedIndex).click();
  await expect(page.getByRole('heading', { name: 'Trade requested', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel trade request', exact: true }).click();
  const cancel = page.getByRole('dialog', { name: 'Cancel trade request' });
  await expect(cancel).toContainText('Cancel only while you are still waiting for escrow.');
  await page.screenshot({ path: testInfo.outputPath('06-cancel-request.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(cancel).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Trade requested', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(external).toEqual([]);
});
