import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type Request as PlaywrightRequest,
  type Route,
  type TestInfo
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const password = 'synthetic-e2e-password-2026';
const blockedTraffic = new WeakMap<Page, string[]>();
const pageErrors = new WeakMap<Page, string[]>();
type Theme = 'light' | 'dark';

test.skip(
  process.env.GROOT_MARKETPLACE_BACKEND !== '1',
  'Real service acceptance requires the dedicated sandbox backend launcher.'
);

async function guardPage(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error('Backend acceptance requires an explicit loopback browser origin.');
  const origin = new URL(baseURL);
  if (origin.hostname !== '127.0.0.1') throw new Error('Backend acceptance uses loopback only.');
  const blocked: string[] = [];
  const errors: string[] = [];
  blockedTraffic.set(page, blocked);
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const target = new URL(route.request().url());
    const shortcut =
      route.request().method() === 'POST' &&
      (target.pathname === '/v1/sandbox/trades' ||
        /^\/v1\/sandbox\/trades\/[^/]+\/complete$/.test(target.pathname));
    if (
      target.origin !== origin.origin ||
      target.pathname.startsWith('/__groot_marketplace/') ||
      shortcut
    ) {
      blocked.push(`${target.origin}${target.pathname}`);
      await route.abort('blockedbyclient');
    } else {
      await route.continue();
    }
  });
  await page.routeWebSocket(
    (target) =>
      target.host !== origin.host ||
      (target.protocol === 'wss:' ? 'https:' : 'http:') !== origin.protocol,
    (socket) => {
      const target = new URL(socket.url());
      blocked.push(`${target.origin}${target.pathname}`);
      socket.close();
    }
  );
}

test.beforeEach(async ({ page, baseURL }) => {
  await guardPage(page, baseURL);
});

test.afterEach(async ({ page }) => {
  expect(
    blockedTraffic.get(page),
    'No off-origin traffic or aggregate trade shortcut is permitted.'
  ).toEqual([]);
  expect(pageErrors.get(page), 'The real service flow must not raise browser errors.').toEqual([]);
});

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}

async function unobstructed(action: Locator) {
  // Ordinary user scrolling can move a control above fixed navigation; minimal
  // viewport scrolling alone can leave it geometrically visible behind the bar.
  await action.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  );
  await expect(action).toBeInViewport({ ratio: 1 });
  expect(
    await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      );
    })
  ).toBe(true);
}

async function evidence(page: Page, info: TestInfo, theme: Theme, name: string) {
  await noOverflow(page);
  const directory = process.env.MARKETPLACE_BACKEND_EVIDENCE_DIR;
  if (directory) mkdirSync(directory, { recursive: true });
  const filename = `marketplace-backend-${info.project.name}-${theme}-${name}.png`;
  const path = directory ? resolve(directory, filename) : info.outputPath(filename);
  const dialogVisible = (await page.getByRole('dialog').count()) > 0;
  await page.screenshot({ path, animations: 'disabled', scale: 'css', fullPage: !dialogVisible });
  await info.attach(filename, { path, contentType: 'image/png' });
}

async function open(page: Page, theme: Theme = 'light', language: 'en' | 'fr' | 'es' = 'en') {
  const copy = {
    en: {
      title: 'Trade bitcoin',
      create: 'Create test account'
    },
    fr: {
      title: 'Échanger du bitcoin',
      create: 'Créer le compte de test'
    },
    es: {
      title: 'Intercambiar bitcoin',
      create: 'Crear cuenta de prueba'
    }
  }[language];
  await page.addInitScript(
    ({ version, theme, language }) => {
      localStorage.setItem('groot-language', language);
      localStorage.setItem('groot-theme', theme);
      localStorage.setItem('groot-notes-dismissed-version', version);
    },
    { version, theme, language }
  );
  await page.goto('/marketplace/backend');
  await expect(page.getByRole('heading', { name: copy.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.create, exact: true })).toBeVisible();
}

async function register(page: Page, theme: Theme = 'light', info?: TestInfo) {
  await open(page, theme);
  if (info) await evidence(page, info, theme, 'create-test-account');
  const username = `e2e_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  await page.getByRole('textbox', { name: 'Test username', exact: true }).fill(username);
  await page.getByLabel('Test password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create test account', exact: true }).click();
  await expect(accountSummary(page)).toContainText(username);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Review trade', exact: true })).toBeEnabled();
  return username;
}

async function begin(page: Page, direction: 'buy' | 'sell', amount = '150') {
  await page
    .getByRole('button', {
      name: direction === 'buy' ? 'Buy' : 'Sell',
      exact: true
    })
    .click();
  const field = page.getByRole('textbox', {
    name: direction === 'buy' ? 'You pay' : 'You receive',
    exact: true
  });
  await field.fill(amount);
  await field.press('Enter');
  await expect(
    page.getByRole('heading', {
      name: direction === 'buy' ? 'Review purchase' : 'Review sale',
      exact: true
    })
  ).toBeVisible();
  await action(page, 'Start trade').click();
  await expect(
    heading(page, direction === 'buy' ? 'Waiting for seller' : 'Lock bitcoin')
  ).toBeVisible();
}

function accountSummary(page: Page) {
  return page.locator('[data-trade-account]');
}

const panelKeys = {
  'Trade options': 'options',
  'Test controls': 'test',
  'Trade activity': 'activity',
  'Trade history': 'trades',
  Account: 'account'
} as const;
type Panel = keyof typeof panelKeys;

function tradePanel(page: Page, name: Panel) {
  return page
    .getByRole('region', { name, exact: true })
    .and(page.locator(`[data-trade-panel="${panelKeys[name]}"]`));
}

async function openPanel(page: Page, name: Panel) {
  const panel = tradePanel(page, name);
  if (!(await panel.isVisible())) await action(page, name).click();
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-trade-panel]:visible')).toHaveCount(1);
}

function accountButton(page: Page, name: 'Refresh status' | 'Sign out') {
  return tradePanel(page, 'Account').getByRole('button', { name, exact: true });
}

async function accountAction(page: Page, name: 'Refresh status' | 'Sign out') {
  await openPanel(page, 'Account');
  await accountButton(page, name).click();
}

async function openOptions(page: Page) {
  await openPanel(page, 'Trade options');
}

async function openTestControls(page: Page) {
  await openPanel(page, 'Test controls');
}

function tradeChat(page: Page) {
  return page.getByRole('region', { name: 'Trade chat', exact: true });
}

function isBackgroundRead(request: PlaywrightRequest, url: URL) {
  if (request.method() !== 'GET') return false;
  if (/^\/v1\/trades\/[^/]+\/(chat-updates|messages)$/.test(url.pathname)) return true;
  return (
    url.pathname === '/v1/workspace' &&
    /^[a-f0-9-]{36}$/.test(url.searchParams.get('tradeId') ?? '') &&
    /^[A-Za-z0-9_-]{43}$/.test(request.headers()['x-groot-marketplace-csrf'] ?? '')
  );
}

async function confirmEscrow(page: Page, direction: 'buy' | 'sell' = 'buy') {
  await action(
    page,
    direction === 'buy' ? 'Simulate seller locking bitcoin' : 'Lock test bitcoin'
  ).click();
  await expect(
    heading(page, direction === 'buy' ? 'Send payment' : 'Waiting for payment')
  ).toBeVisible();
}

async function savedTrades(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/v1/trades', {
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('The real service must return the authenticated journal.');
    const payload = await response.json();
    return payload.data as Array<{
      id: string;
      state: string;
      revision: number;
      role: string;
      quote: {
        fiatCents: number;
        grossSats: number;
        bitcoinSats: number;
        alias: string;
        mode: string;
      };
    }>;
  });
}

function btcDecimal(satoshis: number) {
  const whole = Math.floor(satoshis / 100_000_000);
  return `${whole}.${String(satoshis % 100_000_000).padStart(8, '0')}`;
}

function bitcoinAmount(scope: Locator, satoshis: number, unit: 'sats' | 'BTC' = 'sats') {
  const value =
    unit === 'sats' ? new Intl.NumberFormat('en-US').format(satoshis) : btcDecimal(satoshis);
  return scope
    .locator('.formatted-amount')
    .filter({ hasText: new RegExp(`^${value.replace('.', '\\.')}\\s*${unit}$`) });
}

async function expectUnitsOnOneLine(scope: Locator) {
  const units = scope.locator('.formatted-amount small:visible');
  await expect(units.first()).toBeVisible();
  expect(
    await units.evaluateAll((elements) =>
      elements.every((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const value = element.parentElement?.querySelector('strong');
        const fragments = range.getClientRects();
        return (
          !!value &&
          fragments.length === 1 &&
          value.getBoundingClientRect().right <= fragments[0].left + 0.5
        );
      })
    ),
    'Every visible Bitcoin unit must fit on one line without overlapping its amount'
  ).toBe(true);
}

async function receiptContext(page: Page) {
  const saved = (await savedTrades(page))[0];
  expect(saved.role).toBe('seller');
  expect(saved.state).toBe('payment_sent');
  const dialog = page.getByRole('dialog', { name: 'Check payment', exact: true });
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 1_000 });
  await expect(
    dialog.getByText('A payment claim is not proof of bank receipt.', { exact: true })
  ).toBeVisible();
  await expect(dialog.getByText('Trade partner', { exact: true })).toBeVisible();
  await expect(dialog.getByText(saved.quote.alias, { exact: true })).toBeVisible();
  await expect(dialog.getByText('Expected bank receipt', { exact: true })).toBeVisible();
  const fiat = dialog.getByText(
    new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(
      saved.quote.fiatCents / 100
    ),
    { exact: true }
  );
  await expect(fiat).toBeVisible();
  await expect(dialog.getByText('Bitcoin to release', { exact: true })).toBeVisible();
  const bitcoin = bitcoinAmount(dialog, saved.quote.grossSats);
  await expect(bitcoin).toBeVisible();
  await expectUnitsOnOneLine(dialog);
  await unobstructed(fiat);
  await unobstructed(bitcoin);
}

function action(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

function heading(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true });
}

async function visibleWords(locator: Locator) {
  return locator.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const text: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('[hidden], [aria-hidden="true"]')) continue;
      const closed = parent.closest('details:not([open])');
      if (closed && !closed.querySelector('summary')?.contains(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (range.getClientRects().length) text.push(node.textContent ?? '');
    }
    return [...new Intl.Segmenter('en', { granularity: 'word' }).segment(text.join(' '))].filter(
      (part) => part.isWordLike
    ).length;
  });
}

function recordJourney(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error('Journey evidence requires an explicit loopback origin.');
  const origin = new URL(baseURL).origin;
  const actions: Array<{ activation: string; requests: string[]; testElapsedMs: number }> = [];
  async function activate(
    activation: string,
    control: Locator,
    ready: () => Promise<void>,
    expectedRequests: string[]
  ) {
    const requests: string[] = [];
    const record = (request: PlaywrightRequest) => {
      const url = new URL(request.url());
      if (
        url.origin === origin &&
        url.pathname.startsWith('/v1/') &&
        !isBackgroundRead(request, url)
      )
        requests.push(`${request.method()} ${url.pathname}`);
    };
    const start = performance.now();
    page.on('request', record);
    try {
      await control.click();
      await ready();
    } finally {
      page.off('request', record);
    }
    expect(requests, activation).toEqual(expectedRequests);
    actions.push({ activation, requests, testElapsedMs: Math.round(performance.now() - start) });
  }
  return { activate, actions };
}

async function tradeJournal(page: Page, tradeId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/v1/trades/${id}/events`, {
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store'
    });
    if (!response.ok)
      throw new Error('The saved trade journal must be readable by its participant.');
    const envelope = await response.json();
    return (envelope.data as Array<{ revision: number; kind: string }>).map(
      ({ revision, kind }) => [revision, kind]
    );
  }, tradeId);
}

async function assertTradeStep(page: Page, revision: number) {
  const progress = page.getByRole('navigation', { name: 'Trade progress', exact: true });
  await expect(progress).toBeVisible();
  const current = progress.locator('[aria-current="step"]');
  if (revision === 4) {
    await expect(progress.getByText('All steps complete', { exact: true })).toBeVisible();
    await expect(current).toHaveCount(0);
  } else {
    await expect(progress.getByText(`Step ${revision + 1} of 4`, { exact: true })).toBeVisible();
    await expect(current).toHaveCount(1);
    await expect(
      current.getByText(['Escrow', 'Payment', 'Receipt', 'Release'][revision], { exact: true })
    ).toBeVisible();
    if (revision === 0) {
      const markers = progress.locator('.setup-progress-number');
      await expect(markers).toHaveCount(4);
      const tops = await markers.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().top)
      );
      expect(
        Math.max(...tops) - Math.min(...tops),
        'Trade progress markers must align.'
      ).toBeLessThanOrEqual(1);
    }
  }
}

async function assertMockPayment(page: Page, selling: boolean, revision: number) {
  const stage = page.locator('[data-market-stage]');
  await expectUnitsOnOneLine(stage);
  const qr = stage.getByRole('img', { name: 'Escrow deposit QR', exact: true });
  if (selling && revision === 0) {
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,iVBORw0KGgo/);
    await expect(
      stage.getByText('Regtest only. Use this address with a Regtest wallet.', { exact: true })
    ).toBeVisible();
  } else {
    await expect(qr).toHaveCount(0);
  }
  const bank = stage.getByRole('region', { name: 'Bank details', exact: true });
  const iban = stage.getByText('DE00 0000 0000 0000 0000 00', { exact: true });
  if (!selling && revision === 1) {
    await expect(bank).toBeVisible();
    await expect(bank.getByText('Account holder', { exact: true })).toBeVisible();
    await expect(bank.getByText('TEST SELLER', { exact: true })).toBeVisible();
    await expect(bank.getByText('IBAN', { exact: true })).toBeVisible();
    await expect(iban).toBeVisible();
    await expect(stage.getByText('Payment reference', { exact: true })).toBeVisible();
    await expect(stage.getByText(/^TEST-[A-Z0-9-]+$/i)).toBeVisible();
    await expect(
      stage.getByText('Use these details for practice only. Do not send money.', { exact: true })
    ).toBeVisible();
  } else {
    if (!selling) await expect(bank).toHaveCount(0);
    await expect(iban).toHaveCount(0);
  }
}

type ClipboardWindow = Window & { __marketplaceTestClipboard?: string[] };

async function observeClipboard(page: Page) {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, '__marketplaceTestClipboard', { value: writes });
    // Run the actual copy action without replacing the desktop user's clipboard.
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async (value: string) => {
        writes.push(value);
      }
    });
  });
}

function clipboardWrites(page: Page) {
  return page.evaluate(() => (window as ClipboardWindow).__marketplaceTestClipboard ?? []);
}

async function copyValue(page: Page, label: string) {
  const previous = (await clipboardWrites(page)).length;
  await action(page, label).click();
  await expect.poll(async () => (await clipboardWrites(page)).length).toBe(previous + 1);
  return (await clipboardWrites(page))[previous];
}

async function assertEscrowCopies(page: Page, sats: number) {
  const stage = page.locator('[data-market-stage]');
  const address = await copyValue(page, 'Copy address');
  expect(address).toMatch(/^bcrt1[023456789acdefghjklmnpqrstuvwxyz]{20,90}$/);
  await expect(stage.getByText(address, { exact: true })).toBeVisible();
  expect(await copyValue(page, 'Copy amount')).toBe(btcDecimal(sats));
  const link = new URL(await copyValue(page, 'Copy payment link'));
  expect(link.protocol).toBe('bitcoin:');
  expect(link.pathname).toBe(address);
  expect(link.searchParams.get('amount')).toBe(btcDecimal(sats));
  expect(link.searchParams.get('label')).toBeTruthy();
}

async function primaryClear(control: Locator) {
  await expect(control).toBeVisible();
  // Preserve the real post-transition position if the whole target is on screen.
  if (
    !(await control.evaluate((element) => {
      const { top, bottom } = element.getBoundingClientRect();
      return top >= 0 && bottom <= innerHeight;
    }))
  ) {
    await control.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
    );
  }
  await expect(control).toBeInViewport({ ratio: 1 });
  expect(
    await control.evaluate((element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return [0.15, 0.5, 0.85].every((fraction) =>
        element.contains(document.elementFromPoint(left + width / 2, top + height * fraction))
      );
    }),
    'No toast or navigation may cover the primary action'
  ).toBe(true);
}

async function expectStableToastDismissal(page: Page, info: TestInfo) {
  const tool = action(page, 'Trade activity');
  const position = (scrollToEnd: boolean) =>
    tool.evaluate((control, scrollToEnd) => {
      const scrollAreas: Element[] = [];
      for (let area = control.parentElement; area; area = area.parentElement) {
        if (
          area === document.scrollingElement ||
          /^(auto|scroll)$/.test(getComputedStyle(area).overflowY)
        )
          scrollAreas.push(area);
      }
      if (scrollToEnd) {
        for (const area of scrollAreas)
          area.scrollTo({ top: area.scrollHeight, behavior: 'instant' });
      }
      return {
        toolTop: Math.round(control.getBoundingClientRect().top),
        scrollAreas: scrollAreas.map((area) => ({
          offset: area.scrollTop,
          height: area.scrollHeight,
          viewport: area.clientHeight
        }))
      };
    }, scrollToEnd);
  const notice = page.locator('.toast-region.inline .toast');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('Copied to clipboard.');
  const dismiss = notice.getByRole('button', { name: 'Dismiss', exact: true });
  await position(true);
  await expect(dismiss).toBeInViewport({ ratio: 1 });
  const before = await position(false);
  expect(
    before.scrollAreas.some(({ offset, height, viewport }) => offset > 0 && height > viewport),
    'The buyer must be scrolled down in an overflowing view'
  ).toBe(true);
  await dismiss.click();
  await expect(notice).toHaveCount(0);
  const after = await position(false);
  expect(after, 'Dismissing a notice must preserve scroll extent and trade controls').toEqual(
    before
  );
  await info.attach('trade-toast-scroll-stability.json', {
    contentType: 'application/json',
    body: JSON.stringify({ before, after })
  });
}

for (const direction of ['buy', 'sell'] as const) {
  test(`sequential ${direction} advances through every explicit action and preserves the ordered journal`, async ({
    page,
    baseURL
  }, info) => {
    const selling = direction === 'sell';
    const theme = selling ? 'dark' : 'light';
    await register(page, theme, info);
    const journey = recordJourney(page, baseURL);
    if (selling)
      await journey.activate(
        'Sell',
        action(page, 'Sell'),
        () => expect(page.getByRole('textbox', { name: 'You receive', exact: true })).toBeVisible(),
        []
      );
    for (const amount of ['€50', '€100', '€150', '€250'])
      await expect(action(page, `Review ${amount}`)).toBeEnabled();
    const words: Record<string, number> = {
      amount: await visibleWords(page.locator('[data-market-stage]'))
    };
    await evidence(page, info, theme, `sequential-${direction}-amount`);
    await journey.activate(
      '€100 preset',
      action(page, 'Review €100'),
      async () => {
        await expect(heading(page, selling ? 'Review sale' : 'Review purchase')).toBeVisible();
        await expect(action(page, 'Start trade')).toBeEnabled();
      },
      ['POST /v1/sandbox/quotes']
    );
    await expect(action(page, 'Review trade')).toHaveCount(0);
    expect(await savedTrades(page)).toEqual([]);
    words.review = await visibleWords(page.locator('[data-market-stage]'));
    await evidence(page, info, theme, `sequential-${direction}-review`);

    const lock = selling ? 'Lock test bitcoin' : 'Simulate seller locking bitcoin';
    const payment = selling ? 'Simulate buyer payment' : 'Mark payment sent';
    const release = 'Simulate release confirmation';
    const ready = async (revision: number, title: string, next: string) => {
      await expect(heading(page, title)).toBeVisible();
      await assertTradeStep(page, revision);
      await expect(action(page, next)).toBeEnabled();
      await assertMockPayment(page, selling, revision);
    };
    await journey.activate(
      'Start trade',
      action(page, 'Start trade'),
      () => ready(0, selling ? 'Lock bitcoin' : 'Waiting for seller', lock),
      ['POST /v1/trades', 'GET /v1/workspace']
    );
    const original = await savedTrades(page);
    expect(original).toHaveLength(1);
    const trade = original[0];
    expect(trade).toMatchObject({
      state: 'escrow_pending',
      revision: 0,
      role: selling ? 'seller' : 'buyer',
      quote: { fiatCents: 10_000, mode: 'sandbox' }
    });
    await expect(tradeChat(page)).toBeVisible();
    await expect(
      tradeChat(page).getByRole('textbox', { name: 'Test message', exact: true })
    ).toBeVisible();
    await expect(action(page, 'Refresh chat')).toHaveCount(0);
    const tools = page.getByRole('navigation', { name: 'Trade tools', exact: true });
    for (const name of ['Trade options', 'Trade activity']) {
      await expect(tools.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const accountTools = page.getByRole('navigation', { name: 'Account', exact: true });
    for (const name of ['Trade history', 'Account']) {
      await expect(accountTools.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.locator('[data-trade-panel]:visible')).toHaveCount(0);
    const capture = async (suffix: string) =>
      evidence(page, info, theme, `sequential-${direction}-${suffix}`);
    const expectSaved = async (revision: number, state: string) => {
      const records = await savedTrades(page);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ id: trade.id, revision, state, quote: trade.quote });
    };
    const simulate = [`POST /v1/sandbox/trades/${trade.id}/events`, 'GET /v1/workspace'];
    const participant = [`POST /v1/trades/${trade.id}/commands`, 'GET /v1/workspace'];
    await capture('escrow-pending');
    await journey.activate(
      lock,
      action(page, lock),
      () => ready(1, selling ? 'Waiting for payment' : 'Send payment', payment),
      simulate
    );
    await expectSaved(1, 'awaiting_payment');
    if (!selling) await primaryClear(action(page, payment));
    words.payment = await visibleWords(page.locator('[data-market-stage]'));
    await capture('awaiting-payment');
    await journey.activate(
      payment,
      action(page, payment),
      () =>
        ready(
          2,
          selling ? 'Check your bank' : 'Waiting for the seller',
          selling ? 'Review payment' : 'Simulate seller receipt'
        ),
      selling ? simulate : participant
    );
    await expectSaved(2, 'payment_sent');
    expect(await tradeJournal(page, trade.id)).toEqual([
      [0, 'trade_started'],
      [1, 'sandbox_confirm_escrow'],
      [2, selling ? 'sandbox_buyer_paid' : 'mark_paid']
    ]);
    await expect(heading(page, 'Trade complete')).toHaveCount(0);
    await expect(action(page, release)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await capture('payment-sent');

    if (selling) {
      const dialog = page.getByRole('dialog', { name: 'Check payment', exact: true });
      const checkbox = dialog.getByRole('checkbox', {
        name: 'I checked the amount and sender.',
        exact: true
      });
      const confirm = dialog.getByRole('button', { name: 'Release test bitcoin', exact: true });
      await journey.activate(
        'Review payment',
        action(page, 'Review payment'),
        () => expect(dialog).toBeVisible(),
        []
      );
      await receiptContext(page);
      await expect(checkbox).not.toBeChecked();
      await expect(confirm).toBeDisabled();
      words.receipt = await visibleWords(dialog);
      await capture('receipt-unchecked');
      await journey.activate(
        'Acknowledge bank receipt',
        checkbox,
        () => expect(confirm).toBeEnabled(),
        []
      );
      await unobstructed(confirm);
      await capture('receipt-checked');
      await journey.activate(
        'Release test bitcoin',
        confirm,
        () => ready(3, 'Release pending', release),
        participant
      );
    } else {
      await journey.activate(
        'Simulate seller receipt',
        action(page, 'Simulate seller receipt'),
        () => ready(3, 'Release pending', release),
        simulate
      );
    }
    await expectSaved(3, 'release_pending');
    await expect(heading(page, 'Trade complete')).toHaveCount(0);
    await capture('release-pending');
    await journey.activate(
      release,
      action(page, release),
      () => ready(4, 'Trade complete', 'Back to offers'),
      simulate
    );
    const toast = page.locator('.toast');
    await expect(toast.getByText('Bitcoin released', { exact: true })).toBeVisible();
    await openPanel(page, 'Trade activity');
    await expect(toast).toHaveCount(0, { timeout: 1_000 });
    await expectSaved(4, 'completed');
    expect(await tradeJournal(page, trade.id)).toEqual([
      [0, 'trade_started'],
      [1, 'sandbox_confirm_escrow'],
      [2, selling ? 'sandbox_buyer_paid' : 'mark_paid'],
      [3, selling ? 'confirm_receipt' : 'sandbox_seller_received'],
      [4, 'sandbox_confirm_release']
    ]);
    await expect(page.getByText('Release confirmed.', { exact: true })).toBeVisible();
    expect(journey.actions).toHaveLength(selling ? 9 : 6);
    await info.attach(`sequential-${direction}-journey.json`, {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          scope:
            'Signed-in sandbox; time includes browser automation and is not human reading time.',
          actions: journey.actions,
          visibleStageWords: words
        },
        null,
        2
      )
    });
    const activity = tradePanel(page, 'Trade activity');
    await expect(activity).toContainText(
      /Trade started[\s\S]*Bitcoin locked in test escrow[\s\S]*Buyer marked payment sent[\s\S]*Seller confirmed receipt[\s\S]*Bitcoin released/
    );
    await expect(activity).not.toContainText(/trade_started|sandbox_|mark_paid|confirm_receipt/);
    await capture('activity');
    await action(page, 'Trade activity').click();
    await expect(activity).toBeHidden();
    await capture('complete');
  });
}

test('seller receipt acknowledgement clears on every close and reload', async ({ page }, info) => {
  await register(page);
  await begin(page, 'sell');
  await confirmEscrow(page, 'sell');
  await action(page, 'Simulate buyer payment').click();
  const review = action(page, 'Review payment');
  await review.click();
  const dialog = page.getByRole('dialog', { name: 'Check payment', exact: true });
  const checkbox = dialog.getByRole('checkbox', {
    name: 'I checked the amount and sender.',
    exact: true
  });
  const release = dialog.getByRole('button', { name: 'Release test bitcoin', exact: true });
  await receiptContext(page);
  await expect(checkbox).not.toBeChecked();
  await expect(release).toBeDisabled();
  await checkbox.check();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await review.click();
  await expect(checkbox).not.toBeChecked();
  await expect(release).toBeDisabled();
  await checkbox.check();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await review.click();
  await expect(checkbox).not.toBeChecked();
  await expect(release).toBeDisabled();
  await evidence(page, info, 'light', 'seller-receipt-after-reload');
  expect((await savedTrades(page))[0]).toMatchObject({ state: 'payment_sent', revision: 2 });
});

test('saved trade resumes after navigation, reload, logout and ordinary login without browser credential storage', async ({
  page,
  context
}) => {
  const username = await register(page);
  await begin(page, 'buy');
  await confirmEscrow(page);
  const saved = (await savedTrades(page))[0];
  await page.goto('/marketplace');
  // This application is client-rendered: document load can precede its route
  // imports. Visit the rendered demo before navigating away from it.
  await expect(page.getByRole('heading', { name: 'Trade bitcoin', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeEnabled();
  await page.goto('/marketplace/backend');
  await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
  const cookies = await context.cookies();
  const cookie = cookies.find((item) => item.name === 'groot_marketplace_session');
  if (process.env.GROOT_MARKETPLACE_DEPLOYMENT === '1') expect(cookie?.secure).toBe(true);
  expect(
    cookie && { httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, path: cookie.path }
  ).toEqual({ httpOnly: true, sameSite: 'Strict', path: '/v1' });
  expect(
    await page.evaluate(
      (secret) => Object.values(localStorage).some((value) => value.includes(secret)),
      password
    )
  ).toBe(false);
  expect(
    await page.evaluate(
      (secret) => Object.values(sessionStorage).some((value) => value.includes(secret)),
      password
    )
  ).toBe(false);
  await accountAction(page, 'Sign out');
  await expect(
    page.getByRole('button', { name: 'Create test account', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Test password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Already have a test account?', exact: true }).click();
  await page.getByRole('textbox', { name: 'Test username', exact: true }).fill(username);
  await page.getByLabel('Test password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
  expect((await savedTrades(page))[0]).toEqual(saved);
  await noOverflow(page);
});

test('an unavailable first session read offers retry without exposing a sign-in form', async ({
  page
}, info) => {
  const username = await register(page);
  await begin(page, 'buy');
  const saved = (await savedTrades(page))[0];
  let failRead!: () => void;
  const held = new Promise<void>((release) => (failRead = release));
  const workspace = (url: URL) => url.pathname === '/v1/workspace' && !url.search;
  const failWorkspace = async (route: Route) => {
    await held;
    await route.abort('failed');
  };
  const mutations: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/v1/') && request.method() !== 'GET')
      mutations.push(`${request.method()} ${path}`);
  });
  await page.route(workspace, failWorkspace);
  try {
    await page.reload();
    await expect(
      page.getByRole('status').filter({ hasText: 'Checking for a saved trade…' })
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Test username', exact: true })).toHaveCount(0);
    await expect(accountSummary(page)).toHaveCount(0);
    await expect(heading(page, 'Waiting for seller')).toHaveCount(0);
  } finally {
    failRead();
  }
  await expect(page.getByRole('alert')).toContainText('The test service is unavailable.');
  await expect(page.getByRole('textbox', { name: 'Test username', exact: true })).toHaveCount(0);
  const retry = action(page, 'Try again');
  await expect(retry).toBeEnabled();
  await evidence(page, info, 'light', 'initial-session-read-retry');
  await page.unroute(workspace, failWorkspace);
  await retry.click();
  await expect(heading(page, 'Waiting for seller')).toBeVisible();
  await expect(accountSummary(page)).toContainText(username);
  expect((await savedTrades(page))[0]).toEqual(saved);
  expect(mutations).toEqual([]);
});

test('a revoked real session returns to sign-in inline and resumes its saved trade without reloading', async ({
  page
}, info) => {
  const username = await register(page);
  await begin(page, 'buy');
  await confirmEscrow(page);
  const saved = (await savedTrades(page))[0];
  const status = await page.evaluate(async () => {
    const sessionResponse = await fetch('/v1/session', {
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store'
    });
    const envelope = await sessionResponse.json();
    if (!sessionResponse.ok || typeof envelope.data?.csrfToken !== 'string')
      throw new Error('A real authenticated session is required for revocation.');
    const response = await fetch('/v1/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'X-Groot-Marketplace-CSRF': envelope.data.csrfToken }
    });
    return response.status;
  });
  expect(status).toBe(200);
  await accountAction(page, 'Refresh status');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(accountSummary(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  await evidence(page, info, 'light', 'revoked-session-sign-in');
  await page.getByRole('textbox', { name: 'Test username', exact: true }).fill(username);
  await page.getByLabel('Test password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
  expect((await savedTrades(page))[0]).toEqual(saved);
  await noOverflow(page);
});

test('the session deadline clears the private trade, chat draft and release acknowledgement', async ({
  page
}, info) => {
  await page.clock.install();
  const username = await register(page);
  await begin(page, 'sell');
  await confirmEscrow(page, 'sell');
  const privateText = 'Synthetic private message for the expiring session';
  const draftText = 'Synthetic unsent draft for the expiring session';
  const chat = tradeChat(page);
  const composer = chat.getByRole('textbox', { name: 'Test message', exact: true });
  await composer.fill(privateText);
  await chat.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.getByText(privateText, { exact: true })).toBeVisible();
  await action(page, 'Simulate buyer payment').click();
  await composer.fill(draftText);
  await expect(composer).toHaveValue(draftText);
  await action(page, 'Review payment').click();
  const dialog = page.getByRole('dialog', { name: 'Check payment', exact: true });
  await dialog
    .getByRole('checkbox', { name: 'I checked the amount and sender.', exact: true })
    .check();
  const release = dialog.getByRole('button', { name: 'Release test bitcoin', exact: true });
  await expect(release).toBeEnabled();
  await expect(accountSummary(page)).toContainText(username);

  const expiry = await page.evaluate(async () => {
    const response = await fetch('/v1/session', { cache: 'no-store', redirect: 'error' });
    const { data } = await response.json();
    if (!response.ok || !Number.isSafeInteger(data?.expiresAt))
      throw new Error('An authenticated session deadline is required.');
    return (data.expiresAt as number) - Date.now() + 1_000;
  });
  expect(expiry).toBeGreaterThan(0);
  const mutations: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/v1/') && request.method() !== 'GET')
      mutations.push(`${request.method()} ${path}`);
  });
  // Simulate the local deadline while the server fixture stays unchanged.
  // No reload, user activation or transport failure triggers the cleanup.
  await page.clock.fastForward(expiry);
  await expect(action(page, 'Sign in')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Sign in again to continue.');
  await expect(accountSummary(page)).toHaveCount(0);
  await expect(chat).toHaveCount(0);
  await expect(page.getByText(privateText, { exact: true })).toHaveCount(0);
  await expect(composer).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await expect(action(page, 'Release test bitcoin')).toHaveCount(0);
  await expect(page.getByLabel('Test password', { exact: true })).toHaveValue('');
  expect(mutations).toEqual([]);
  await evidence(page, info, 'light', 'session-deadline-privacy-cleanup');
});

test('switching real accounts clears unsent messages and seller receipt acknowledgement', async ({
  page
}) => {
  const firstUsername = await register(page);
  await begin(page, 'sell');
  await confirmEscrow(page, 'sell');
  await action(page, 'Simulate buyer payment').click();
  await expect(tradeChat(page)).toBeVisible();
  const privateDraft = `Synthetic private draft from ${firstUsername}`;
  await page.getByRole('textbox', { name: 'Test message', exact: true }).fill(privateDraft);
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Check payment', exact: true });
  const checkbox = dialog.getByRole('checkbox', {
    name: 'I checked the amount and sender.',
    exact: true
  });
  await checkbox.check();
  await page.keyboard.press('Escape');
  await accountAction(page, 'Sign out');
  const createToggle = page.getByRole('button', { name: 'Create a test account', exact: true });
  if (await createToggle.isVisible()) await createToggle.click();
  const nextUsername = `e2e_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  await page.getByRole('textbox', { name: 'Test username', exact: true }).fill(nextUsername);
  await page.getByLabel('Test password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create test account', exact: true }).click();
  await expect(accountSummary(page)).toContainText(nextUsername);
  await expect(accountSummary(page)).not.toContainText(firstUsername);
  expect(await savedTrades(page)).toEqual([]);
  await begin(page, 'sell');
  await confirmEscrow(page, 'sell');
  await action(page, 'Simulate buyer payment').click();
  const messageInput = page.getByRole('textbox', { name: 'Test message', exact: true });
  await expect(messageInput).toHaveValue('');
  await expect(page.getByText(privateDraft, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review payment', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(
    dialog.getByRole('button', { name: 'Release test bitcoin', exact: true })
  ).toBeDisabled();
  await noOverflow(page);
});

test('a shared-cookie account switch in another tab refreshes identity before revealing trades or drafts', async ({
  page,
  context,
  baseURL
}) => {
  const firstUsername = await register(page);
  await begin(page, 'sell');
  await confirmEscrow(page, 'sell');
  await action(page, 'Simulate buyer payment').click();
  const firstTrade = (await savedTrades(page))[0];
  await expect(tradeChat(page)).toBeVisible();
  const savedPrivateText = `Synthetic account A saved evidence ${firstUsername}`;
  const unsentPrivateText = `Synthetic account A unsent draft ${firstUsername}`;
  await page.getByRole('textbox', { name: 'Test message', exact: true }).fill(savedPrivateText);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText(savedPrivateText, { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Test message', exact: true }).fill(unsentPrivateText);

  const secondTab = await context.newPage();
  await guardPage(secondTab, baseURL);
  try {
    await secondTab.goto('/marketplace/backend');
    await expect(accountSummary(secondTab)).toContainText(firstUsername);
    await accountAction(secondTab, 'Sign out');
    const createToggle = secondTab.getByRole('button', {
      name: 'Create a test account',
      exact: true
    });
    if (await createToggle.isVisible()) await createToggle.click();
    const nextUsername = `e2e_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    await secondTab.getByRole('textbox', { name: 'Test username', exact: true }).fill(nextUsername);
    await secondTab.getByLabel('Test password', { exact: true }).fill(password);
    await secondTab.getByRole('button', { name: 'Create test account', exact: true }).click();
    await expect(accountSummary(secondTab)).toContainText(nextUsername);
    await begin(secondTab, 'sell');
    await confirmEscrow(secondTab, 'sell');
    await action(secondTab, 'Simulate buyer payment').click();
    const nextTrade = (await savedTrades(secondTab))[0];
    expect(nextTrade.id).not.toBe(firstTrade.id);

    // Cookies are shared by these real browser tabs. Tab A still displays its
    // old identity and selected trade until the canonical workspace changes
    // principal and safely falls back to B's existing active trade.
    await accountAction(page, 'Refresh status');
    await expect(accountSummary(page)).toContainText(nextUsername);
    await expect(accountSummary(page)).not.toContainText(firstUsername);
    await expect(page.getByText(savedPrivateText, { exact: true })).toHaveCount(0);
    await expect(page.getByText(unsentPrivateText, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Check your bank', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review trade', exact: true })).toHaveCount(0);
    expect(await savedTrades(page)).toEqual([nextTrade]);
    const currentMessage = page.getByRole('textbox', { name: 'Test message', exact: true });
    await expect(currentMessage).toHaveValue('');
    await expect(page.getByText(savedPrivateText, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Review payment', exact: true }).click();
    const receipt = page.getByRole('dialog', {
      name: 'Check payment',
      exact: true
    });
    await expect(
      receipt.getByRole('checkbox', {
        name: 'I checked the amount and sender.',
        exact: true
      })
    ).not.toBeChecked();
    await expect(
      receipt.getByRole('button', { name: 'Release test bitcoin', exact: true })
    ).toBeDisabled();
    await page.keyboard.press('Escape');

    // Returning to A proves that account reconciliation cleared presentation,
    // while preserving A's durable evidence under A's own authorization.
    await accountAction(secondTab, 'Sign out');
    await secondTab
      .getByRole('button', { name: 'Already have a test account?', exact: true })
      .click();
    await secondTab
      .getByRole('textbox', { name: 'Test username', exact: true })
      .fill(firstUsername);
    await secondTab.getByLabel('Test password', { exact: true }).fill(password);
    await secondTab.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(accountSummary(secondTab)).toContainText(firstUsername);
    expect(await savedTrades(secondTab)).toEqual([firstTrade]);
    await expect(tradeChat(secondTab)).toBeVisible();
    await expect(secondTab.getByText(savedPrivateText, { exact: true })).toBeVisible();
    await expect(secondTab.getByRole('textbox', { name: 'Test message', exact: true })).toHaveValue(
      ''
    );
    await noOverflow(page);
    await noOverflow(secondTab);
  } finally {
    expect(
      blockedTraffic.get(secondTab),
      'The second tab must not attempt off-origin traffic.'
    ).toEqual([]);
    expect(pageErrors.get(secondTab), 'The second tab must not raise browser errors.').toEqual([]);
    await secondTab.close();
  }
});

type LiveObservation = {
  kind: 'chat-update' | 'trade-update' | 'read';
  path: string;
  verified: boolean;
};
type LiveObservationWindow = Window & { __grootLiveTestObservations?: LiveObservation[] };

async function observeLiveUpdates(page: Page) {
  await page.addInitScript(() => {
    const observations: LiveObservation[] = [];
    Object.defineProperty(window, '__grootLiveTestObservations', { value: observations });
    const record = (observation: LiveObservation) => {
      if (observations.length < 64) observations.push(observation);
    };
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        for (const kind of ['chat-update', 'trade-update'] as const) {
          this.addEventListener(kind, (event) => {
            record({
              kind,
              path: new URL(this.url).pathname,
              verified: event instanceof MessageEvent && event.data === '{}'
            });
          });
        }
      }
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const target = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (
        target.origin === location.origin &&
        method === 'GET' &&
        (target.pathname === '/v1/workspace' ||
          /^\/v1\/trades\/[^/]+\/messages$/.test(target.pathname))
      ) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        );
        record({
          kind: 'read',
          path: `${target.pathname}${target.search}`,
          verified: /^[A-Za-z0-9_-]{43}$/.test(headers.get('X-Groot-Marketplace-CSRF') ?? '')
        });
      }
      return nativeFetch(input, init);
    };
  });
}

function liveObservations(page: Page) {
  return page.evaluate(() => (window as LiveObservationWindow).__grootLiveTestObservations ?? []);
}

async function expectNotificationRead(
  page: Page,
  before: number,
  kind: 'chat-update' | 'trade-update',
  streamPath: string,
  readPath: string
) {
  const observations = (await liveObservations(page)).slice(before);
  const push = observations.findIndex((event) => event.kind === kind && event.path === streamPath);
  expect(push).toBeGreaterThanOrEqual(0);
  expect(observations[push]).toMatchObject({ verified: true });
  expect(
    observations.findIndex(
      (event) => event.kind === 'read' && event.path === readPath && event.verified
    )
  ).toBeGreaterThan(push);
}

async function participantPost(page: Page, path: string, data: Record<string, unknown>) {
  return page.evaluate(
    async ({ path, data }) => {
      const session = await (
        await fetch('/v1/session', { cache: 'no-store', redirect: 'error' })
      ).json();
      const response = await fetch(path, {
        method: 'POST',
        redirect: 'error',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Groot-Marketplace-CSRF': session.data.csrfToken,
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify(data)
      });
      return {
        status: response.status,
        data: (await response.json()).data as { id: string } | undefined
      };
    },
    { path, data }
  );
}

async function expectLiveMessage(
  sender: Page,
  receiver: Page,
  id: string,
  text: string,
  senderName: string
) {
  const messagePath = `/v1/trades/${id}/messages`;
  const streamPath = `/v1/trades/${id}/chat-updates`;
  const before = (await liveObservations(receiver)).length;
  const senderChat = tradeChat(sender);
  const receiverChat = tradeChat(receiver);
  await expect(receiverChat.getByText(text, { exact: true })).toHaveCount(0);
  await senderChat.getByRole('textbox', { name: 'Test message', exact: true }).fill(text);
  const read = receiver.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === messagePath &&
      response.request().method() === 'GET' &&
      response.status() === 200,
    { timeout: 8_000 }
  );
  const [readResponse] = await Promise.all([
    read,
    senderChat.getByRole('button', { name: 'Send message', exact: true }).click()
  ]);
  // Inspect only whether the actual authenticated read had the token shape;
  // never retain its value or any message body in the network observer.
  expect(
    /^[A-Za-z0-9_-]{43}$/.test(readResponse.request().headers()['x-groot-marketplace-csrf'] ?? '')
  ).toBe(true);
  const received = receiverChat.getByRole('listitem').filter({ hasText: text });
  await expect(received.getByText(text, { exact: true })).toBeVisible();
  await expect(received.getByText(senderName, { exact: true })).toBeVisible();
  await expect(
    senderChat.getByRole('listitem').filter({ hasText: text }).getByText('You', { exact: true })
  ).toBeVisible();
  await expectNotificationRead(receiver, before, 'chat-update', streamPath, messagePath);
}

async function expectLiveTrade(
  receiver: Page,
  id: string,
  change: () => Promise<void>,
  expectedTitle: string
) {
  const before = (await liveObservations(receiver)).length;
  const stream = `/v1/trades/${id}/chat-updates`;
  const selectedWorkspace = `/v1/workspace?tradeId=${id}`;
  const stage = receiver.locator('[data-market-stage]');
  await expect(stage.getByRole('button', { name: 'Refresh status', exact: true })).toHaveCount(0);
  const read = receiver.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        `${url.pathname}${url.search}` === selectedWorkspace &&
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        /^[A-Za-z0-9_-]{43}$/.test(response.request().headers()['x-groot-marketplace-csrf'] ?? '')
      );
    },
    { timeout: 8_000 }
  );
  await Promise.all([read, change()]);
  await expect(heading(receiver, expectedTitle)).toBeVisible();
  await expect(stage.getByRole('button', { name: 'Refresh status', exact: true })).toHaveCount(0);
  await expectNotificationRead(receiver, before, 'trade-update', stream, selectedWorkspace);
}

const practiceBank = { recipient: 'TEST SELLER01', iban: 'DE00 0000 0000 0000 1234 56' };

function bankDetails(page: Page) {
  return page
    .locator('[data-market-stage]')
    .getByRole('region', { name: 'Bank details', exact: true });
}

async function savePracticeBank(sellerPage: Page, tradeId: string, useExample = false) {
  const bank = bankDetails(sellerPage);
  await expect(bank).toBeVisible();
  await expect(action(sellerPage, 'Lock test bitcoin')).toHaveCount(0);
  const qr = sellerPage.getByRole('img', { name: 'Escrow deposit QR', exact: true });
  await expect(qr).toHaveCount(0);
  const holder = bank.getByRole('textbox', { name: 'Account holder', exact: true });
  const iban = bank.getByRole('textbox', { name: 'IBAN', exact: true });
  const save = bank.getByRole('button', { name: 'Save bank details', exact: true });
  await expect(save).toBeDisabled();
  if (useExample) {
    await bank.getByRole('button', { name: 'Use example details', exact: true }).click();
  } else {
    await holder.fill('SAMPLE SELLER');
    await iban.fill(practiceBank.iban);
    await expect(save).toBeDisabled();
    await holder.fill(practiceBank.recipient);
    await iban.fill('DE00 0000 0000 0000 1234');
    await expect(save).toBeDisabled();
    await iban.fill(practiceBank.iban);
  }
  await expect(holder).toHaveValue(practiceBank.recipient);
  await expect(iban).toHaveValue(practiceBank.iban);
  const saved = sellerPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/v1/trades/${tradeId}/payment-instructions` &&
      response.request().method() === 'POST'
  );
  const [response] = await Promise.all([saved, save.click()]);
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({
    expectedRevision: 0,
    recipient: practiceBank.recipient,
    iban: practiceBank.iban.replaceAll(' ', '')
  });
  await expect(action(sellerPage, 'Lock test bitcoin')).toBeEnabled();
  await expect(qr).toBeVisible();
  await expect(bank).toHaveCount(0);
}

async function selectedPaymentInstructions(page: Page, tradeId: string) {
  return page.evaluate(async (tradeId) => {
    const response = await fetch(`/v1/workspace?tradeId=${tradeId}`, {
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('The participant must receive its selected trade workspace.');
    const { data } = await response.json();
    if (data.selected?.trade.id !== tradeId)
      throw new Error('Workspace selected a different trade.');
    return data.selected.paymentInstructions as {
      recipient: string;
      iban: string;
      reference: string;
    } | null;
  }, tradeId);
}

async function awaitTradeStream(actor: Page, id: string) {
  const connection = await actor.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/v1/trades/${id}/chat-updates` &&
      response.status() === 200,
    { timeout: 8_000 }
  );
  expect(connection.headers()['content-type']).toContain('text/event-stream');
  expect(new URL(connection.url()).search).toBe('');
}

async function withHumanPair(
  page: Page,
  browser: Browser,
  baseURL: string | undefined,
  info: TestInfo,
  exercise: (pair: { buyerPage: Page; buyer: string; seller: string; id: string }) => Promise<void>
) {
  if (!baseURL) throw new Error('Human participant rehearsal requires an explicit local origin.');
  const use = info.project.use;
  const buyerContext = await browser.newContext({
    baseURL,
    viewport: page.viewportSize() ?? undefined,
    ignoreHTTPSErrors: use.ignoreHTTPSErrors,
    httpCredentials: use.httpCredentials,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch
  });
  try {
    const buyerPage = await buyerContext.newPage();
    await guardPage(buyerPage, baseURL);
    try {
      for (const actor of [page, buyerPage]) {
        await observeLiveUpdates(actor);
        await observeClipboard(actor);
      }
      const seller = await register(page);
      const buyer = await register(buyerPage);
      await expect(accountSummary(page)).toContainText(seller);
      await expect(accountSummary(buyerPage)).toContainText(buyer);
      const offer = await participantPost(page, '/v1/offers', {
        intent: 'buy',
        pricePerBtcCents: 9_000_000,
        minCents: 5_000,
        maxCents: 25_000
      });
      expect(offer.status).toBe(201);
      const quoted = await participantPost(buyerPage, '/v1/quotes', {
        offerId: offer.data?.id,
        amountCents: 12_000
      });
      expect(quoted.status).toBe(201);
      const created = await participantPost(buyerPage, '/v1/trades', { quoteId: quoted.data?.id });
      expect(created.status).toBe(201);
      const id = created.data?.id;
      if (!id) throw new Error('The two participants did not receive a saved trade ID.');
      // This bootstrap selects the API-created fixture. Every following peer
      // transition is observed without a click, reload, or refresh by the receiver.
      await Promise.all([
        awaitTradeStream(page, id),
        awaitTradeStream(buyerPage, id),
        accountAction(page, 'Refresh status'),
        accountAction(buyerPage, 'Refresh status')
      ]);
      await expect(heading(page, 'Lock bitcoin')).toBeVisible();
      await expect(heading(buyerPage, 'Waiting for seller')).toBeVisible();
      await exercise({ buyerPage, buyer, seller, id });
      await noOverflow(page);
      await noOverflow(buyerPage);
    } finally {
      expect(
        blockedTraffic.get(buyerPage),
        'The independent buyer must not attempt off-origin traffic.'
      ).toEqual([]);
      expect(
        pageErrors.get(buyerPage),
        'The independent buyer must not raise browser errors.'
      ).toEqual([]);
    }
  } finally {
    await buyerContext.close();
  }
}

test('two real human browsers exchange live chat and each confirms only its own trade actions', async ({
  page,
  browser,
  baseURL
}, info) => {
  await withHumanPair(page, browser, baseURL, info, async ({ buyerPage, buyer, seller, id }) => {
    expect(
      (
        await participantPost(buyerPage, `/v1/sandbox/trades/${id}/events`, {
          action: 'confirm_escrow',
          expectedRevision: 0
        })
      ).status
    ).toBe(403);
    expect(
      (
        await participantPost(buyerPage, `/v1/trades/${id}/payment-instructions`, {
          expectedRevision: 0,
          recipient: practiceBank.recipient,
          iban: practiceBank.iban.replaceAll(' ', '')
        })
      ).status
    ).toBe(403);
    await expect(action(buyerPage, 'Simulate seller locking bitcoin')).toHaveCount(0);
    await assertTradeStep(page, 0);
    const saved = (await savedTrades(page))[0];
    expect(saved).toMatchObject({ id, state: 'escrow_pending', revision: 0 });
    await evidence(page, info, 'light', 'seller-bank-details-before-escrow');
    await savePracticeBank(page, id);
    expect(await selectedPaymentInstructions(buyerPage, id)).toBeNull();
    await expect(bankDetails(buyerPage)).toHaveCount(0);
    await Promise.all([awaitTradeStream(page, id), page.reload()]);
    await expect(action(page, 'Lock test bitcoin')).toBeEnabled();
    await expect(bankDetails(page)).toHaveCount(0);
    await assertMockPayment(page, true, 0);
    await assertEscrowCopies(page, saved.quote.grossSats);
    await evidence(page, info, 'light', 'seller-regtest-escrow-copy');
    const sellerInstructions = await selectedPaymentInstructions(page, id);
    expect(sellerInstructions).toMatchObject(practiceBank);
    if (!sellerInstructions) throw new Error('The seller must have saved payment instructions.');
    expect(sellerInstructions.reference).toMatch(/^TEST-[A-Z0-9-]+$/);

    await expectLiveTrade(buyerPage, id, () => confirmEscrow(page, 'sell'), 'Send payment');
    await assertTradeStep(buyerPage, 1);
    await expect(page.locator('[data-market-stage]')).toContainText(buyer);
    await expect(buyerPage.locator('[data-market-stage]')).toContainText(seller);
    await expect(action(page, 'Simulate buyer payment')).toHaveCount(0);
    const buyerBank = bankDetails(buyerPage);
    await expect(buyerBank.getByText(practiceBank.recipient, { exact: true })).toBeVisible();
    await expect(buyerBank.getByText(practiceBank.iban, { exact: true })).toBeVisible();
    await expect(buyerBank.getByText(sellerInstructions.reference, { exact: true })).toBeVisible();
    await expect(buyerBank.getByRole('textbox')).toHaveCount(0);
    expect(await selectedPaymentInstructions(buyerPage, id)).toEqual(sellerInstructions);
    expect(await copyValue(buyerPage, 'Copy payment details')).toBe(
      [
        'Amount: €120.00',
        `Account holder: ${practiceBank.recipient}`,
        `IBAN: ${practiceBank.iban}`,
        `Payment reference: ${sellerInstructions.reference}`
      ].join('\n')
    );
    expect(await copyValue(buyerPage, 'Copy account holder')).toBe(practiceBank.recipient);
    expect(await copyValue(buyerPage, 'Copy IBAN')).toBe(practiceBank.iban);
    expect(await copyValue(buyerPage, 'Copy reference')).toBe(sellerInstructions.reference);
    await expect(
      tradeChat(page).getByText('No personal or bank details.', { exact: true })
    ).toBeVisible();
    await expect(action(page, 'Refresh chat')).toHaveCount(0);
    if (info.project.name === 'desktop') {
      const [stageBounds, chatBounds] = await Promise.all([
        buyerPage.locator('[data-market-stage]').boundingBox(),
        tradeChat(buyerPage).boundingBox()
      ]);
      if (!stageBounds || !chatBounds) throw new Error('The trade and chat must both be visible.');
      expect(chatBounds.x).toBeGreaterThan(stageBounds.x + stageBounds.width);
      expect(Math.abs(chatBounds.y - stageBounds.y)).toBeLessThanOrEqual(1);
      expect(chatBounds.x + chatBounds.width).toBeLessThanOrEqual(1180);
    } else {
      const chatHeading = tradeChat(buyerPage).getByRole('heading', {
        name: 'Trade chat',
        exact: true
      });
      await buyerPage.getByRole('link', { name: 'Jump to chat', exact: true }).click();
      await expect(chatHeading).toBeFocused();
      await expect(chatHeading).toBeInViewport({ ratio: 1 });
      expect(
        await chatHeading.evaluate((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
        })
      ).toBe(true);
    }

    await expectLiveMessage(
      buyerPage,
      page,
      id,
      'Synthetic buyer: I am ready to send the test payment.',
      buyer
    );
    await expectLiveMessage(
      page,
      buyerPage,
      id,
      'Synthetic seller: I will check the test receipt before release.',
      seller
    );
    await expect(heading(page, 'Waiting for payment')).toBeVisible();
    await expect(heading(buyerPage, 'Send payment')).toBeVisible();
    expect((await savedTrades(page))[0]).toMatchObject({
      id,
      state: 'awaiting_payment',
      revision: 1
    });
    await evidence(page, info, 'light', 'trade-chat-two-participants');
    await evidence(buyerPage, info, 'light', 'buyer-live-chat-and-payment');

    // A passive trade transition preserves the signed-in seller's unsent chat draft.
    const sellerDraft = tradeChat(page).getByRole('textbox', { name: 'Test message', exact: true });
    await sellerDraft.fill('Synthetic unsent seller draft');
    await expectLiveTrade(
      page,
      id,
      () => action(buyerPage, 'Mark payment sent').click(),
      'Check your bank'
    );
    await expect(sellerDraft).toHaveValue('Synthetic unsent seller draft');
    await assertTradeStep(page, 2);
    await expect(heading(buyerPage, 'Waiting for the seller')).toBeVisible();
    await expect(action(buyerPage, 'Simulate seller receipt')).toHaveCount(0);
    await action(page, 'Review payment').click();
    const dialog = page.getByRole('dialog', { name: 'Check payment', exact: true });
    await expect(dialog.getByText(buyer, { exact: true })).toBeVisible();
    await expect(dialog.getByText(seller, { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('€120.00', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Payment reference', { exact: true })).toBeVisible();
    await expect(dialog.getByText(sellerInstructions.reference, { exact: true })).toBeVisible();
    await evidence(page, info, 'light', 'human-seller-payment-reference-review');
    const release = dialog.getByRole('button', { name: 'Release test bitcoin', exact: true });
    await expect(release).toBeDisabled();
    await dialog
      .getByRole('checkbox', { name: 'I checked the amount and sender.', exact: true })
      .check();
    await expectLiveTrade(
      buyerPage,
      id,
      () =>
        recordJourney(page, baseURL).activate(
          'Release test bitcoin to a human participant',
          release,
          () => expect(heading(page, 'Release pending')).toBeVisible(),
          [`POST /v1/trades/${id}/commands`, 'GET /v1/workspace']
        ),
      'Release pending'
    );
    await assertTradeStep(buyerPage, 3);
    expect((await savedTrades(page))[0]).toMatchObject({
      id,
      state: 'release_pending',
      revision: 3
    });
    await expectLiveTrade(
      buyerPage,
      id,
      () => action(page, 'Simulate release confirmation').click(),
      'Trade complete'
    );
    await assertTradeStep(buyerPage, 4);
    await expect(heading(page, 'Trade complete')).toBeVisible();
    expect(await tradeJournal(page, id)).toEqual([
      [0, 'trade_started'],
      [1, 'sandbox_confirm_escrow'],
      [2, 'mark_paid'],
      [3, 'confirm_receipt'],
      [4, 'sandbox_confirm_release']
    ]);
    expect(await tradeJournal(buyerPage, id)).toEqual(await tradeJournal(page, id));
  });
});

test('human trade without saved bank details blocks payment and preserves recovery', async ({
  page,
  browser,
  baseURL
}, info) => {
  await withHumanPair(page, browser, baseURL, info, async ({ buyerPage, id }) => {
    // The service still supports the historical trade transition. Exercise the
    // buyer view of that saved state without sending synthetic bank details.
    const before = (await liveObservations(buyerPage)).length;
    expect(
      (
        await participantPost(page, `/v1/sandbox/trades/${id}/events`, {
          action: 'confirm_escrow',
          expectedRevision: 0
        })
      ).status
    ).toBe(200);
    const stage = buyerPage.locator('[data-market-stage]');
    await expect(
      stage.getByRole('alert').getByText('Payment details unavailable', { exact: true })
    ).toBeVisible();
    await expectNotificationRead(
      buyerPage,
      before,
      'trade-update',
      `/v1/trades/${id}/chat-updates`,
      `/v1/workspace?tradeId=${id}`
    );
    expect(await selectedPaymentInstructions(buyerPage, id)).toBeNull();
    await expect(bankDetails(buyerPage)).toHaveCount(0);
    await expect(action(buyerPage, 'Mark payment sent')).toHaveCount(0);
    await expect(action(buyerPage, 'Copy payment details')).toHaveCount(0);
    await expect(stage.getByText('DE00 0000 0000 0000 0000 00', { exact: true })).toHaveCount(0);
    await expect(tradeChat(buyerPage)).toBeVisible();
    await evidence(buyerPage, info, 'light', 'human-buyer-payment-details-unavailable');
    await openOptions(buyerPage);
    await expect(action(buyerPage, 'Request cancellation and refund')).toBeEnabled();
    await expectLiveTrade(
      page,
      id,
      () => action(buyerPage, 'Request cancellation and refund').click(),
      'Refund pending'
    );
    expect(await tradeJournal(buyerPage, id)).toEqual([
      [0, 'trade_started'],
      [1, 'sandbox_confirm_escrow'],
      [2, 'request_refund']
    ]);
  });
});

test('two real human browsers see refund and late-payment dispute without refreshing', async ({
  page,
  browser,
  baseURL
}, info) => {
  await withHumanPair(page, browser, baseURL, info, async ({ buyerPage, id }) => {
    await savePracticeBank(page, id, true);
    await expectLiveTrade(buyerPage, id, () => confirmEscrow(page, 'sell'), 'Send payment');
    await openOptions(page);
    expect(await copyValue(buyerPage, 'Copy IBAN')).toBe(practiceBank.iban);
    await expectStableToastDismissal(buyerPage, info);
    await expectLiveTrade(
      buyerPage,
      id,
      () => action(page, 'Request cancellation and refund').click(),
      'Refund pending'
    );
    await expect(heading(page, 'Refund pending')).toBeVisible();
    await expectLiveTrade(
      page,
      id,
      () => action(buyerPage, 'I already sent payment').click(),
      'Trade paused'
    );
    await expect(heading(buyerPage, 'Trade paused')).toBeVisible();
    for (const actor of [page, buyerPage]) {
      await expect(
        actor.getByRole('navigation', { name: 'Trade progress', exact: true })
      ).toHaveCount(0);
      await expect(action(actor, 'Simulate release confirmation')).toHaveCount(0);
      await expect(action(actor, 'Simulate confirmed refund')).toHaveCount(0);
      expect(await tradeJournal(actor, id)).toEqual([
        [0, 'trade_started'],
        [1, 'sandbox_confirm_escrow'],
        [2, 'request_refund'],
        [3, 'mark_paid']
      ]);
    }
    await evidence(page, info, 'light', 'human-seller-live-late-payment');
    await evidence(buyerPage, info, 'light', 'human-buyer-live-late-payment');
  });
});

test('saved messages remain inert text through a dispute and explicit sandbox refund decision', async ({
  page
}, info) => {
  await register(page);
  await begin(page, 'buy');
  await confirmEscrow(page);
  await expect(tradeChat(page)).toBeVisible();
  const message = 'Synthetic evidence <script>window.unexpectedExecution=true</script> 🙂';
  await page.getByRole('textbox', { name: 'Test message', exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'There is a problem', exact: true })).toBeHidden();
  await openOptions(page);
  await page.getByRole('button', { name: 'There is a problem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trade paused', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Trade progress', exact: true })).toHaveCount(
    0
  );
  await expect(
    page.getByRole('button', { name: 'Simulate release confirmation', exact: true })
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Trade paused', exact: true })).toBeVisible();
  await expect(tradeChat(page)).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => 'unexpectedExecution' in window)).toBe(false);
  await evidence(page, info, 'light', 'saved-dispute');
  await expect(
    page.getByRole('button', { name: 'Simulate dispute refund decision', exact: true })
  ).toBeHidden();
  await openTestControls(page);
  await action(page, 'Simulate dispute refund decision').click();
  await expect(page.getByRole('heading', { name: 'Refund pending', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bitcoin refunded', exact: true })).toHaveCount(0);
  await action(page, 'Simulate confirmed refund').click();
  await expect(page.getByRole('heading', { name: 'Bitcoin refunded', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Trade progress', exact: true })).toHaveCount(
    0
  );
  await evidence(page, info, 'light', 'refund-confirmed');
  await openPanel(page, 'Trade activity');
  const refunded = (await savedTrades(page))[0];
  expect(await tradeJournal(page, refunded.id)).toEqual([
    [0, 'trade_started'],
    [1, 'sandbox_confirm_escrow'],
    [2, 'dispute'],
    [3, 'sandbox_resolve_refund'],
    [4, 'sandbox_confirm_refund']
  ]);
  await expect(tradePanel(page, 'Trade activity')).not.toContainText(/sandbox_|trade_started/);
  await noOverflow(page);
});

test('late payment freezes a pending refund and explicit sandbox release needs its own confirmation', async ({
  page
}, info) => {
  await register(page);
  await begin(page, 'sell');
  await confirmEscrow(page, 'sell');
  await expect(
    page.getByRole('button', { name: 'Request cancellation and refund', exact: true })
  ).toBeHidden();
  await openOptions(page);
  await page.getByRole('button', { name: 'Request cancellation and refund', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Refund pending', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Trade progress', exact: true })).toHaveCount(
    0
  );
  await evidence(page, info, 'light', 'refund-pending');
  await expect(
    page.getByRole('button', { name: 'Simulate late payment claim', exact: true })
  ).toBeHidden();
  await openTestControls(page);
  await action(page, 'Simulate late payment claim').click();
  await expect(page.getByRole('heading', { name: 'Trade paused', exact: true })).toBeVisible();
  await evidence(page, info, 'light', 'late-payment-dispute');
  await expect(
    page.getByRole('button', { name: 'Simulate confirmed refund', exact: true })
  ).toHaveCount(0);
  await openTestControls(page);
  await action(page, 'Simulate dispute release decision').click();
  await expect(page.getByRole('heading', { name: 'Release pending', exact: true })).toBeVisible();
  await action(page, 'Simulate release confirmation').click();
  await expect(page.getByRole('heading', { name: 'Trade complete', exact: true })).toBeVisible();
  expect((await savedTrades(page))[0]).toMatchObject({ state: 'completed', revision: 5 });
});

test('a buyer can report a late payment during refund without suggesting ordinary progress', async ({
  page,
  baseURL
}, info) => {
  await register(page);
  await begin(page, 'buy');
  await confirmEscrow(page);
  await openOptions(page);
  await action(page, 'Request cancellation and refund').click();
  await expect(heading(page, 'Refund pending')).toBeVisible();
  const progress = page.getByRole('navigation', { name: 'Trade progress', exact: true });
  await expect(progress).toHaveCount(0);
  const reportPayment = action(page, 'I already sent payment');
  await expect(reportPayment).toBeEnabled();
  const pendingRefund = (await savedTrades(page))[0];
  expect(pendingRefund).toMatchObject({ role: 'buyer', state: 'refund_pending', revision: 2 });
  await evidence(page, info, 'light', 'buyer-refund-pending');
  await recordJourney(page, baseURL).activate(
    'I already sent payment',
    reportPayment,
    () => expect(heading(page, 'Trade paused')).toBeVisible(),
    [`POST /v1/trades/${pendingRefund.id}/commands`, 'GET /v1/workspace']
  );
  await expect(progress).toHaveCount(0);
  await expect(action(page, 'Simulate confirmed refund')).toHaveCount(0);
  await expect(action(page, 'Simulate release confirmation')).toHaveCount(0);
  expect((await savedTrades(page))[0]).toMatchObject({
    id: pendingRefund.id,
    state: 'disputed',
    revision: 3
  });
  expect(await tradeJournal(page, pendingRefund.id)).toEqual([
    [0, 'trade_started'],
    [1, 'sandbox_confirm_escrow'],
    [2, 'request_refund'],
    [3, 'mark_paid']
  ]);
  await evidence(page, info, 'light', 'buyer-late-payment-dispute');
});

test('pre-funding cancellation preserves history and permits a fresh saved trade', async ({
  page
}, info) => {
  await register(page);
  await begin(page, 'buy', '50');
  await expect(page.getByRole('button', { name: 'Cancel trade', exact: true })).toBeHidden();
  await openOptions(page);
  await page.getByRole('button', { name: 'Cancel trade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trade cancelled', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Trade progress', exact: true })).toHaveCount(
    0
  );
  await evidence(page, info, 'light', 'trade-cancelled');
  const cancelled = (await savedTrades(page))[0];
  await page.getByRole('button', { name: 'Back to offers', exact: true }).click();
  await begin(page, 'sell', '250');
  const current = await savedTrades(page);
  expect(current).toHaveLength(2);
  expect(current[0]).toMatchObject({
    state: 'escrow_pending',
    role: 'seller',
    quote: { fiatCents: 25_000 }
  });
  expect(current[1]).toEqual(cancelled);
  await noOverflow(page);
});

test('invalid amounts and wrong login remain visible, clear passwords and recover normally', async ({
  page
}, info) => {
  const username = await register(page);
  const amount = page.getByRole('textbox', { name: 'You pay', exact: true });
  for (const invalid of ['49.99', '250.01', '1e2', '-100', '']) {
    await amount.fill(invalid);
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Review trade', exact: true })).toBeDisabled();
  }
  await evidence(page, info, 'light', 'invalid-amount');
  await amount.fill('50,00');
  await expect(page.getByRole('button', { name: 'Review trade', exact: true })).toBeEnabled();
  await accountAction(page, 'Sign out');
  await page.getByRole('textbox', { name: 'Test username', exact: true }).fill(username);
  await page.getByLabel('Test password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create test account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'That test username already exists. Sign in or choose another.'
  );
  await expect(page.getByLabel('Test password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Already have a test account?', exact: true }).click();
  await page.getByRole('textbox', { name: 'Test username', exact: true }).fill(username);
  await page.getByLabel('Test password', { exact: true }).fill('synthetic-wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Check your test username and password, then try again.'
  );
  await expect(page.getByLabel('Test password', { exact: true })).toHaveValue('');
  await evidence(page, info, 'light', 'wrong-test-password');
  await page.getByLabel('Test password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(accountSummary(page)).toContainText(username);
  await noOverflow(page);
});

test('quote review has one explicit next step and expiry requires a fresh estimate before a trade can start', async ({
  page,
  baseURL
}, info) => {
  if (!baseURL) throw new Error('Quote observation requires an explicit local browser origin.');
  const origin = new URL(baseURL).origin;

  async function quoteFrom(action: () => Promise<void>) {
    type ObservedQuote = {
      id: string;
      fiatCents: number;
      bitcoinSats: number;
      expiresAt: number;
    };
    let report!: (quote: ObservedQuote) => void;
    let fail!: (error: unknown) => void;
    const observation = new Promise<ObservedQuote>((resolve, reject) => {
      report = resolve;
      fail = reject;
    });
    const target = (url: URL) => url.origin === origin && url.pathname === '/v1/sandbox/quotes';
    const observe = async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      try {
        const url = new URL(route.request().url());
        if (url.origin !== origin || url.pathname !== '/v1/sandbox/quotes' || url.search)
          throw new Error('Quote observation must forward only the exact same-origin endpoint.');
        // Forward the actual mutation exactly once and read its actual HTTP
        // response before delivering it unchanged. This avoids Chromium's
        // transient CDP body handles; no quote or service result is fabricated.
        const response = await route.fetch({ maxRedirects: 0 });
        expect(response.status()).toBe(201);
        const envelope = await response.json();
        expect(envelope).toMatchObject({ apiVersion: 1, mode: 'sandbox' });
        await route.fulfill({ response });
        report(envelope.data as ObservedQuote);
      } catch (error) {
        fail(error);
        await route.abort('failed').catch(() => {});
      }
    };
    await page.route(target, observe);
    try {
      const [quote] = await Promise.all([observation, action()]);
      return quote;
    } finally {
      await page.unroute(target, observe);
    }
  }

  await register(page);
  const amount = page.getByRole('textbox', { name: 'You pay', exact: true });
  await amount.fill('150');
  const first = await quoteFrom(() =>
    page.getByRole('button', { name: 'Review trade', exact: true }).click()
  );
  const start = page.getByRole('button', { name: 'Start trade', exact: true });
  await expect(start).toBeEnabled();
  await expect(amount).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review trade', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit amount', exact: true })).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 1_000 });
  await expect(page.locator('dl').getByText('You pay', { exact: true })).toBeVisible();
  await expect(page.locator('dl').getByText('You receive', { exact: true })).toBeVisible();
  await unobstructed(
    page
      .locator('dl')
      .getByText(
        new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(
          first.fiatCents / 100
        ),
        { exact: true }
      )
  );
  const amountReview = page.locator('[data-market-stage] dl');
  await unobstructed(bitcoinAmount(amountReview, first.bitcoinSats));
  await bitcoinAmount(amountReview, first.bitcoinSats).click();
  await expect(bitcoinAmount(amountReview, first.bitcoinSats, 'BTC')).toBeVisible();
  await bitcoinAmount(amountReview, first.bitcoinSats, 'BTC').click();
  await expect(bitcoinAmount(amountReview, first.bitcoinSats)).toBeVisible();
  await unobstructed(start);
  expect(await savedTrades(page)).toEqual([]);
  await evidence(page, info, 'light', 'quote-review');

  await page.getByRole('button', { name: 'Edit amount', exact: true }).click();
  await expect(amount).toHaveValue('150');
  await expect(start).toHaveCount(0);
  await amount.fill('100');
  const changed = await quoteFrom(() =>
    page.getByRole('button', { name: 'Review trade', exact: true }).click()
  );
  expect(changed.id).not.toBe(first.id);
  expect(changed.fiatCents).toBe(10_000);
  await expect(start).toBeEnabled();
  expect(await savedTrades(page)).toEqual([]);

  const tradeRequests: Array<{ path: string; body: string | null }> = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (['/v1/trades', '/v1/sandbox/trades'].includes(path) && request.method() === 'POST')
      tradeRequests.push({ path, body: request.postData() });
  });
  // Only the browser clock moves. The real service and its quote remain intact;
  // this proves the UI never submits its expired displayed estimate.
  await page.clock.setFixedTime(changed.expiresAt + 1_001);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(start.and(page.locator(':enabled'))).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Quote expired.');
  await expect(heading(page, 'Review purchase')).toBeVisible();
  await expect(
    page.locator('[data-market-stage] dl').getByText('€100.00', { exact: true })
  ).toBeVisible();
  const refreshEstimate = page.getByRole('button', { name: 'Get new quote', exact: true });
  await expect(refreshEstimate).toBeEnabled();
  expect(tradeRequests).toEqual([]);
  expect(await savedTrades(page)).toEqual([]);
  await evidence(page, info, 'light', 'quote-expired');

  // A backward clock correction must not make the same expired quote actionable.
  await page.clock.setFixedTime(Date.now());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(start.and(page.locator(':enabled'))).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Quote expired.');
  await expect(refreshEstimate).toBeEnabled();
  expect(tradeRequests).toEqual([]);
  const refreshed = await quoteFrom(() => refreshEstimate.click());
  expect(refreshed.id).not.toBe(changed.id);
  expect(refreshed.fiatCents).toBe(10_000);
  await expect(start).toBeEnabled();
  expect(tradeRequests).toEqual([]);
  expect(await savedTrades(page)).toEqual([]);
  await start.click();
  await expect(heading(page, 'Waiting for seller')).toBeVisible();
  await assertTradeStep(page, 0);
  expect(tradeRequests).toEqual([
    { path: '/v1/trades', body: JSON.stringify({ quoteId: refreshed.id }) }
  ]);
  expect((await savedTrades(page))[0]).toMatchObject({
    revision: 0,
    state: 'escrow_pending',
    quote: { id: refreshed.id, fiatCents: 10_000 }
  });
  await noOverflow(page);
});

test('keyboard quote recovery preserves the entered amount, restores focus and cannot start a trade implicitly', async ({
  page,
  baseURL
}, info) => {
  await register(page);
  if (!baseURL) throw new Error('Keyboard quote recovery requires a local origin.');
  const origin = new URL(baseURL).origin;
  const target = (url: URL) => url.origin === origin && url.pathname === '/v1/sandbox/quotes';
  const sent: Array<{ key: string | undefined; body: string | null }> = [];
  const fault = async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    sent.push({ key: request.headers()['idempotency-key'], body: request.postData() });
    if (sent.length === 1) return route.abort('failed');
    return route.fallback();
  };
  await page.route(target, fault);
  try {
    await action(page, 'Sell').press('Enter');
    const amount = page.getByRole('textbox', { name: 'You receive', exact: true });
    await amount.fill('100,00');
    await amount.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Request result unknown', { exact: true })).toBeVisible();
    await expect(heading(page, 'Review sale')).toHaveCount(0);
    await expect(amount).toHaveValue('100,00');
    await expect(amount).toBeDisabled();
    expect(await savedTrades(page)).toEqual([]);
    await evidence(page, info, 'light', 'quote-retry-required');

    await action(page, 'Retry request').press('Enter');
    const review = heading(page, 'Review sale');
    await expect(review).toBeFocused();
    await expect(action(page, 'Start trade')).toBeEnabled();
    expect(sent).toHaveLength(2);
    expect(sent[0].key).toMatch(/^[A-Za-z0-9_-]{16,80}$/);
    expect(sent[1]).toEqual(sent[0]);
    expect(JSON.parse(sent[1].body ?? '{}')).toEqual({ intent: 'sell', amountCents: 10_000 });
    await page.keyboard.press('Enter');
    await expect(review).toBeFocused();
    expect(await savedTrades(page)).toEqual([]);

    await action(page, 'Edit amount').press('Enter');
    await expect(amount).toBeFocused();
    await expect(amount).toHaveValue('100,00');
    await expect(action(page, 'Sell')).toHaveAttribute('aria-pressed', 'true');
    await expect(action(page, 'Start trade')).toHaveCount(0);
    await amount.fill('110');
    await amount.press('Enter');
    await expect(review).toBeFocused();
    await expect(page.locator('dl').getByText('€110.00', { exact: true })).toBeVisible();
    expect(sent).toHaveLength(3);
    expect(sent[2].key).not.toBe(sent[0].key);
    expect(JSON.parse(sent[2].body ?? '{}')).toEqual({ intent: 'sell', amountCents: 11_000 });
    expect(await savedTrades(page)).toEqual([]);
    await noOverflow(page);
  } finally {
    await page.unroute(target, fault);
  }
});

test('one canonical workspace read refreshes a complete view and a failed read cannot partially publish newer state', async ({
  page,
  baseURL
}) => {
  await register(page);
  await begin(page, 'buy');
  await expect(action(page, 'Simulate seller locking bitcoin')).toBeEnabled();
  const initial = (await savedTrades(page))[0];
  await openPanel(page, 'Trade activity');
  await expect(
    tradePanel(page, 'Trade activity').getByText('Trade started', { exact: true })
  ).toBeVisible();

  if (!baseURL)
    throw new Error('The workspace exercise requires an explicit local browser origin.');
  const origin = new URL(baseURL).origin;
  const target = (url: URL) => url.origin === origin && url.pathname === '/v1/workspace';
  const reads: string[] = [];
  const trackReads = (request: PlaywrightRequest) => {
    const url = new URL(request.url());
    if (
      url.origin === origin &&
      url.pathname.startsWith('/v1/') &&
      request.method() === 'GET' &&
      !isBackgroundRead(request, url)
    )
      reads.push(url.pathname);
  };
  await page.route(target, (route) => route.abort('failed'));
  try {
    // Fail both passive and explicit workspace reads before changing the saved trade.
    const committed = await page.evaluate(
      async ({ id, key }) => {
        const session = await (await fetch('/v1/session', { cache: 'no-store' })).json();
        const response = await fetch(`/v1/sandbox/trades/${id}/events`, {
          method: 'POST',
          credentials: 'same-origin',
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json',
            'X-Groot-Marketplace-CSRF': session.data.csrfToken,
            'Idempotency-Key': key
          },
          body: JSON.stringify({ action: 'confirm_escrow', expectedRevision: 0 })
        });
        const payload = await response.json();
        return {
          status: response.status,
          state: payload.data?.state,
          revision: payload.data?.revision
        };
      },
      { id: initial.id, key: randomUUID() }
    );
    expect(committed).toEqual({ status: 200, state: 'awaiting_payment', revision: 1 });
    page.on('request', trackReads);
    await accountAction(page, 'Refresh status');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Waiting for seller', exact: true })
    ).toBeVisible();
    await expect(action(page, 'Simulate seller locking bitcoin')).toBeEnabled();
    await openPanel(page, 'Trade activity');
    await expect(
      tradePanel(page, 'Trade activity').getByText('Trade started', { exact: true })
    ).toBeVisible();
    await expect(
      tradePanel(page, 'Trade activity').getByText('Bitcoin locked in test escrow', {
        exact: true
      })
    ).toHaveCount(0);
    await expect(page.getByText('Request result unknown', { exact: true })).toHaveCount(0);
    expect(reads).toEqual(['/v1/workspace']);

    await page.unroute(target);
    await accountAction(page, 'Refresh status');
    await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
    await expect(action(page, 'Mark payment sent')).toBeEnabled();
    await openPanel(page, 'Trade activity');
    await expect(
      tradePanel(page, 'Trade activity').getByText('Bitcoin locked in test escrow', {
        exact: true
      })
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(reads).toEqual(['/v1/workspace', '/v1/workspace']);

    await action(page, 'Mark payment sent').click();
    await expect(
      page.getByRole('heading', { name: 'Waiting for the seller', exact: true })
    ).toBeVisible();
    await expect(action(page, 'Simulate seller receipt')).toBeEnabled();
    expect(reads).toEqual(['/v1/workspace', '/v1/workspace', '/v1/workspace']);
  } finally {
    await page.unroute(target);
    page.off('request', trackReads);
  }
  expect((await savedTrades(page))[0]).toMatchObject({
    id: initial.id,
    state: 'payment_sent',
    revision: 2
  });
  await noOverflow(page);
});

test('a known saved command followed by an unavailable workspace freezes the complete old view until a read-only refresh', async ({
  page,
  baseURL
}, info) => {
  await register(page);
  await begin(page, 'buy');
  const initial = (await savedTrades(page))[0];
  const advance = action(page, 'Simulate seller locking bitcoin');
  await expect(advance).toBeEnabled();
  await openPanel(page, 'Trade activity');
  await expect(
    tradePanel(page, 'Trade activity').getByText('Trade started', { exact: true })
  ).toBeVisible();
  if (!baseURL)
    throw new Error('The post-commit exercise requires an explicit local browser origin.');
  const origin = new URL(baseURL).origin;
  const workspace = (url: URL) => url.origin === origin && url.pathname === '/v1/workspace';
  const commands: Array<{ key: string | undefined; body: string | null }> = [];
  const trackCommand = (request: PlaywrightRequest) => {
    const url = new URL(request.url());
    if (
      url.origin === origin &&
      url.pathname === `/v1/sandbox/trades/${initial.id}/events` &&
      request.method() === 'POST'
    )
      commands.push({ key: request.headers()['idempotency-key'], body: request.postData() });
  };
  page.on('request', trackCommand);
  await page.route(workspace, (route) => route.abort('failed'));
  try {
    await advance.click();
    await expect(page.getByRole('alert')).toContainText(
      'Your action was saved. Refresh status to continue.'
    );
    await expect(
      page.getByRole('heading', { name: 'Waiting for seller', exact: true })
    ).toBeVisible();
    await expect(
      tradePanel(page, 'Trade activity').getByText('Trade started', { exact: true })
    ).toBeVisible();
    await expect(
      tradePanel(page, 'Trade activity').getByText('Bitcoin locked in test escrow', {
        exact: true
      })
    ).toHaveCount(0);
    await expect(advance).toBeDisabled();
    await expect(page.getByText('Request result unknown', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry request', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh status', exact: true })).toBeEnabled();
    expect((await savedTrades(page))[0]).toMatchObject({
      id: initial.id,
      state: 'awaiting_payment',
      revision: 1
    });
    expect(commands).toHaveLength(1);
    await evidence(page, info, 'light', 'saved-action-refresh-required');

    await page.unroute(workspace);
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
    await expect(
      tradePanel(page, 'Trade activity').getByText('Bitcoin locked in test escrow', {
        exact: true
      })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark payment sent', exact: true })
    ).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(commands).toHaveLength(1);
    expect((await savedTrades(page))[0]).toMatchObject({
      id: initial.id,
      state: 'awaiting_payment',
      revision: 1
    });
    await noOverflow(page);
  } finally {
    await page.unroute(workspace);
    page.off('request', trackCommand);
  }
});

test('a saved trade whose workspace read fails keeps its reviewed quote locked and resumes without a second creation', async ({
  page,
  baseURL
}, info) => {
  await register(page);
  await page.getByRole('button', { name: 'Review trade', exact: true }).click();
  const start = page.getByRole('button', { name: 'Start trade', exact: true });
  await expect(start).toBeEnabled();
  if (!baseURL) throw new Error('The saved-creation exercise requires an explicit local origin.');
  const origin = new URL(baseURL).origin;
  const workspace = (url: URL) => url.origin === origin && url.pathname === '/v1/workspace';
  const creations: string[] = [];
  const trackCreation = (request: PlaywrightRequest) => {
    const url = new URL(request.url());
    if (
      url.origin === origin &&
      ['/v1/trades', '/v1/sandbox/trades'].includes(url.pathname) &&
      request.method() === 'POST'
    )
      creations.push(request.postData() ?? '');
  };
  page.on('request', trackCreation);
  await page.route(workspace, (route) => route.abort('failed'));
  try {
    await start.click();
    await expect(page.getByRole('alert')).toContainText(
      'Your action was saved. Refresh status to continue.'
    );
    await expect(page.getByRole('heading', { name: 'Review purchase', exact: true })).toBeVisible();
    await expect(start).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edit amount', exact: true })).toBeDisabled();
    await expect(page.getByText('Request result unknown', { exact: true })).toHaveCount(0);
    const saved = await savedTrades(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ state: 'escrow_pending', revision: 0 });
    expect(creations).toHaveLength(1);
    await evidence(page, info, 'light', 'saved-trade-refresh-required');

    await page.unroute(workspace);
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Waiting for seller', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review purchase', exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Simulate seller locking bitcoin', exact: true })
    ).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await savedTrades(page)).toEqual(saved);
    expect(creations).toHaveLength(1);
    await noOverflow(page);
  } finally {
    await page.unroute(workspace);
    page.off('request', trackCreation);
  }
});

test('an ambiguous offline command recovers through the same idempotency key with one durable event', async ({
  page,
  context
}, info) => {
  await register(page);
  await begin(page, 'buy');
  const initial = (await savedTrades(page))[0];
  await context.setOffline(true);
  try {
    await action(page, 'Simulate seller locking bitcoin').click();
    await expect(page.getByText('Request result unknown', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    await evidence(page, info, 'light', 'offline-command-retry');
  } finally {
    await context.setOffline(false);
  }
  await page.getByRole('button', { name: 'Retry request', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
  await expect(page.getByText('Request result unknown', { exact: true })).toHaveCount(0);
  expect((await savedTrades(page))[0]).toMatchObject({ id: initial.id, revision: 1 });
  await openPanel(page, 'Trade activity');
  await expect(
    tradePanel(page, 'Trade activity').getByText('Bitcoin locked in test escrow', { exact: true })
  ).toHaveCount(1);
  await noOverflow(page);
});

test('a response lost after the real server commits replays the same request without repeating its durable transition', async ({
  page,
  baseURL
}) => {
  await register(page);
  await begin(page, 'buy');
  const initial = (await savedTrades(page))[0];
  if (!baseURL) throw new Error('The commit-loss exercise requires a local browser origin.');
  const origin = new URL(baseURL).origin;
  const target = (url: URL) =>
    url.origin === origin && url.pathname === `/v1/sandbox/trades/${initial.id}/events`;
  const sent: Array<{ key: string | undefined; body: string | null }> = [];
  let committed: { status: number; state?: string; revision?: number } | undefined;
  let dropResponse: (() => void) | undefined;
  const holdResponse = new Promise<void>((resolve) => {
    dropResponse = resolve;
  });
  await page.route(target, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    sent.push({ key: request.headers()['idempotency-key'], body: request.postData() });
    if (sent.length === 1) {
      // Fault injection forwards the actual request to the actual SQLite-backed
      // service, then drops its successful response. No API result is mocked.
      const response = await route.fetch({ maxRedirects: 0 });
      const payload = await response.json();
      committed = {
        status: response.status(),
        state: payload.data?.state,
        revision: payload.data?.revision
      };
      // Keep the actual successful response in flight while the UI assertion
      // distinguishes ordinary loading from a genuinely ambiguous failure.
      await holdResponse;
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  try {
    await action(page, 'Simulate seller locking bitcoin').click();
    await expect
      .poll(() => committed, {
        message: 'The real service must commit before its successful response is lost.'
      })
      .toEqual({ status: 200, state: 'awaiting_payment', revision: 1 });
    await expect(
      page.getByRole('button', { name: 'Simulate seller locking bitcoin', exact: true })
    ).toBeDisabled();
    await expect(page.getByText('Request result unknown', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry request', exact: true })).toHaveCount(0);
    dropResponse?.();
    await expect(page.getByText('Request result unknown', { exact: true })).toBeVisible();
    expect((await savedTrades(page))[0]).toMatchObject({
      id: initial.id,
      state: 'awaiting_payment',
      revision: 1
    });
    await page.getByRole('button', { name: 'Retry request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Send payment', exact: true })).toBeVisible();
    await expect(page.getByText('Request result unknown', { exact: true })).toHaveCount(0);
    expect(sent).toHaveLength(2);
    expect(sent[0].key).toMatch(/^[A-Za-z0-9_-]{16,80}$/);
    expect(sent[1]).toEqual(sent[0]);
    expect((await savedTrades(page))[0]).toMatchObject({
      id: initial.id,
      state: 'awaiting_payment',
      revision: 1
    });
    await openPanel(page, 'Trade activity');
    await expect(
      tradePanel(page, 'Trade activity').getByText('Trade started', { exact: true })
    ).toHaveCount(1);
    await expect(
      tradePanel(page, 'Trade activity').getByText('Bitcoin locked in test escrow', {
        exact: true
      })
    ).toHaveCount(1);
    await noOverflow(page);
  } finally {
    dropResponse?.();
    await page.unroute(target);
  }
});

test('keyboard-only review keeps receipt focus contained at a narrow reduced-motion viewport', async ({
  page,
  browserName
}, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await register(page);
  await begin(page, 'sell');
  await confirmEscrow(page, 'sell');
  await action(page, 'Simulate buyer payment').click();
  const review = page.getByRole('button', { name: 'Review payment', exact: true });
  // Wait for the restored controls before moving focus with the keyboard.
  await expect(review).toBeEnabled();
  await review.focus();
  await expect(review).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Check payment', exact: true });
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 1_000 });
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeFocused();
  // Safari's macOS preference uses Option-Tab for intermediate form controls;
  // the modal itself owns the ordinary Tab wrap at its final control below.
  const nextControl = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(nextControl);
  await expect(dialog.locator('button.formatted-amount')).toBeFocused();
  await page.keyboard.press(nextControl);
  const checkbox = dialog.getByRole('checkbox', {
    name: 'I checked the amount and sender.',
    exact: true
  });
  await expect(checkbox).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press(nextControl);
  const release = dialog.getByRole('button', {
    name: 'Release test bitcoin',
    exact: true
  });
  await expect(release).toBeFocused();
  await unobstructed(release);
  await evidence(page, info, 'light', 'keyboard-receipt-narrow');
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(review).toBeFocused();
  await noOverflow(page);
});

for (const copy of [
  {
    language: 'fr',
    username: 'Nom d’utilisateur de test',
    password: 'Mot de passe de test',
    create: 'Créer le compte de test',
    buy: 'Acheter',
    amount: 'Vous payez',
    find: 'Vérifier l’échange',
    review: 'Vérifier l’achat',
    start: 'Démarrer l’échange'
  },
  {
    language: 'es',
    username: 'Nombre de usuario de prueba',
    password: 'Contraseña de prueba',
    create: 'Crear cuenta de prueba',
    buy: 'Comprar',
    amount: 'Pagas',
    find: 'Revisar intercambio',
    review: 'Revisar compra',
    start: 'Iniciar intercambio'
  }
] as const) {
  test(`localized ${copy.language} registration and actual backend quote retain the translated review`, async ({
    page
  }, info) => {
    await open(page, 'light', copy.language);
    const username = `e2e_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    await page.getByRole('textbox', { name: copy.username, exact: true }).fill(username);
    await page.getByLabel(copy.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: copy.create, exact: true }).click();
    await expect(page.getByRole('button', { name: copy.buy, exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: copy.amount, exact: true }).fill('100,00');
    await page.getByRole('button', { name: copy.find, exact: true }).click();
    await expect(page.getByRole('heading', { name: copy.review, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.start, exact: true })).toBeEnabled();
    expect(await savedTrades(page)).toEqual([]);
    await evidence(page, info, 'light', `localized-${copy.language}-quote`);
  });
}
