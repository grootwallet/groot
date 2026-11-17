import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
type Theme = 'light' | 'dark';
type Language = 'en' | 'fr' | 'es';
type Scenario = 'buy' | 'sell' | 'delayed_payment' | 'seller_receipt' | 'refund' | 'unavailable';
const blockedTraffic = new WeakMap<Page, string[]>();

test.skip(
  process.env.GROOT_MARKETPLACE_DISCOVERY === '1',
  'The complete rehearsal is tested with public provider discovery disabled.'
);

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('The rehearsal requires an explicit local browser origin.');
  const origin = new URL(baseURL);
  const blocked: string[] = [];
  blockedTraffic.set(page, blocked);
  await page.route('**/*', async (route) => {
    const target = new URL(route.request().url());
    if (target.origin !== origin.origin || target.pathname.startsWith('/__groot_marketplace/')) {
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
});

test.afterEach(async ({ page }) => {
  expect(
    blockedTraffic.get(page),
    'A rehearsal must never attempt provider or off-origin traffic.'
  ).toEqual([]);
});

async function open(page: Page, theme: Theme = 'light', language: Language = 'en') {
  const headings = {
    en: { title: 'Trade bitcoin', preview: 'Design preview' },
    fr: { title: 'Échanger du bitcoin', preview: 'Aperçu de l’interface' },
    es: { title: 'Intercambiar bitcoin', preview: 'Vista previa del diseño' }
  };
  await page.addInitScript(
    ({ version, theme, language }) => {
      localStorage.setItem('groot-language', language);
      localStorage.setItem('groot-theme', theme);
      localStorage.setItem('groot-notes-dismissed-version', version);
    },
    { version, theme, language }
  );
  await page.goto('/marketplace');
  await expect(
    page.getByRole('heading', { name: headings[language].title, exact: true })
  ).toBeVisible();
  await expect(page.getByText(headings[language].preview, { exact: true })).toBeVisible();
  await expect(page.locator('a[href="/marketplace/discover"]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function scenarioDialog(page: Page) {
  await page.getByRole('button', { name: /^(Test scenarios|Restart demo)$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a test scenario', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function chooseScenario(page: Page, scenario: Scenario) {
  const dialog = await scenarioDialog(page);
  await dialog.getByRole('combobox', { name: 'Test scenario', exact: true }).selectOption(scenario);
  await dialog.getByRole('button', { name: 'Start scenario', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function beginTrade(page: Page, intent: 'buy' | 'sell') {
  await chooseScenario(page, intent);
  await expect(
    page.getByRole('textbox', { name: intent === 'buy' ? 'You pay' : 'You receive', exact: true })
  ).toHaveValue('150');
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
  const title = intent === 'buy' ? 'Review purchase' : 'Review sale';
  await page.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.getByRole('button', { name: 'Start demo trade', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Start demo trade', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'First, secure the bitcoin', exact: true })
  ).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}

async function unobstructed(action: Locator) {
  await expect(action).toBeInViewport({ ratio: 1 });
  expect(
    await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2
      );
      return element.contains(hit);
    })
  ).toBe(true);
}

async function evidence(page: Page, info: TestInfo, theme: Theme, name: string, dialog = false) {
  if (!dialog) await expect(page.locator('.modal-layer')).toHaveCount(0);
  await noOverflow(page);
  const directory = process.env.MARKETPLACE_EVIDENCE_DIR;
  if (directory) mkdirSync(directory, { recursive: true });
  const filename = `marketplace-rehearsal-${info.project.name}-${theme}-${name}.png`;
  const path = directory ? resolve(directory, filename) : info.outputPath(filename);
  await page.screenshot({ path, animations: 'disabled', scale: 'css' });
  await info.attach(filename, { path, contentType: 'image/png' });
  if (!dialog) {
    const fullFilename = filename.replace('.png', '-full.png');
    const fullPath = directory ? resolve(directory, fullFilename) : info.outputPath(fullFilename);
    await page.screenshot({ path: fullPath, animations: 'disabled', scale: 'css', fullPage: true });
    await info.attach(fullFilename, { path: fullPath, contentType: 'image/png' });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: a complete buy rehearsal remains offline from providers and requires a fresh payment acknowledgement`, async ({
    page
  }, info) => {
    await open(page, theme);
    await evidence(page, info, theme, 'initial');
    const scenarios = await scenarioDialog(page);
    await expect(
      scenarios.getByRole('combobox', { name: 'Test scenario', exact: true })
    ).toBeVisible();
    await evidence(page, info, theme, 'test-scenarios', true);
    await page.keyboard.press('Escape');
    await beginTrade(page, 'buy');
    await expect(
      page.getByRole('button', { name: 'Mark demo payment as sent', exact: true })
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Simulate confirmed escrow', exact: true }).click();
    await page.getByRole('button', { name: 'Mark demo payment as sent', exact: true }).click();
    const payment = page.getByRole('dialog', { name: 'Mark payment as sent?', exact: true });
    const checkbox = payment.getByRole('checkbox', {
      name: 'I understand the buyer’s claim does not prove receipt.',
      exact: true
    });
    const confirm = payment.getByRole('button', { name: 'Confirm demo payment sent', exact: true });
    await expect(checkbox).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await checkbox.check();
    await expect(confirm).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(payment).toBeHidden();
    await page.getByRole('button', { name: 'Mark demo payment as sent', exact: true }).click();
    await expect(checkbox).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await checkbox.check();
    await confirm.click();
    await expect(
      page.getByRole('heading', { name: 'Payment sent. Waiting for the seller.', exact: true })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Simulate release and confirmation', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Trade complete', exact: true })).toBeVisible();
    await expect(page.getByText('Demo completed', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/No money moved. A live trade is complete only after/)
    ).toBeVisible();
    await noOverflow(page);
  });

  test(`${theme}: a complete sell rehearsal requires bank-receipt review and a separate confirmation event`, async ({
    page
  }, info) => {
    await open(page, theme);
    await beginTrade(page, 'sell');
    await page.getByRole('button', { name: 'Simulate confirmed escrow', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Waiting for the buyer’s transfer', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Simulate buyer payment claim', exact: true }).click();
    await page.getByRole('button', { name: 'Review payment and release', exact: true }).click();
    const receipt = page.getByRole('dialog', {
      name: 'Confirm receipt before release',
      exact: true
    });
    const checkbox = receipt.getByRole('checkbox', {
      name: 'I checked the matching payment in my bank account.',
      exact: true
    });
    const release = receipt.getByRole('button', {
      name: 'Confirm demo receipt and release',
      exact: true
    });
    await expect(checkbox).not.toBeChecked();
    await expect(release).toBeDisabled();
    await expect(receipt.getByText(/Releasing bitcoin is irreversible/)).toBeVisible();
    await checkbox.scrollIntoViewIfNeeded();
    await evidence(page, info, theme, 'receipt-confirmation', true);
    await checkbox.check();
    await release.click();
    await expect(
      page.getByRole('heading', { name: 'Releasing the bitcoin', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Trade complete', exact: true })).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Simulate release and confirmation', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Trade complete', exact: true })).toBeVisible();
    await noOverflow(page);
  });
}

for (const copy of [
  {
    language: 'fr',
    scenarios: 'Scénarios de test',
    chooser: 'Choisir un scénario de test',
    select: 'Scénario de test',
    start: 'Lancer le scénario',
    state: 'L’argent est-il arrivé sur votre compte ?',
    review: 'Vérifier le paiement et libérer',
    receipt: 'Confirmer la réception avant la libération',
    checked: 'J’ai vérifié le paiement correspondant sur mon compte bancaire.',
    release: 'Confirmer la réception fictive et libérer'
  },
  {
    language: 'es',
    scenarios: 'Escenarios de prueba',
    chooser: 'Elegir un escenario de prueba',
    select: 'Escenario de prueba',
    start: 'Iniciar escenario',
    state: '¿Ha llegado el dinero a tu cuenta bancaria?',
    review: 'Revisar el pago y liberar',
    receipt: 'Confirmar la recepción antes de liberar',
    checked: 'He comprobado el pago correspondiente en mi cuenta bancaria.',
    release: 'Confirmar recepción de demostración y liberar'
  }
] as const) {
  test(`localized rehearsal chooser and guarded seller receipt (${copy.language})`, async ({
    page
  }, info) => {
    await open(page, 'light', copy.language);
    await page.getByRole('button', { name: copy.scenarios, exact: true }).click();
    const chooser = page.getByRole('dialog', { name: copy.chooser, exact: true });
    await chooser
      .getByRole('combobox', { name: copy.select, exact: true })
      .selectOption('seller_receipt');
    const start = chooser.getByRole('button', { name: copy.start, exact: true });
    await start.scrollIntoViewIfNeeded();
    await unobstructed(start);
    await evidence(page, info, 'light', `localized-chooser-${copy.language}`, true);
    await start.click();
    await expect(page.getByRole('heading', { name: copy.state, exact: true })).toBeVisible();
    await page.getByRole('button', { name: copy.review, exact: true }).click();
    const receipt = page.getByRole('dialog', { name: copy.receipt, exact: true });
    await expect(
      receipt.getByRole('checkbox', { name: copy.checked, exact: true })
    ).not.toBeChecked();
    const release = receipt.getByRole('button', { name: copy.release, exact: true });
    await expect(release).toBeDisabled();
    await release.scrollIntoViewIfNeeded();
    await expect(release).toBeInViewport({ ratio: 1 });
    await noOverflow(page);
  });
}

test('an unavailable scenario recovers through one explicit inline action', async ({ page }) => {
  await open(page);
  await chooseScenario(page, 'unavailable');
  await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
  const restore = page.getByRole('button', { name: 'Restore demo offers', exact: true });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh offers', exact: true })).toHaveCount(0);
  await unobstructed(restore);
  await restore.click();
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(restore).toHaveCount(0);
  await noOverflow(page);
});

test('keyboard review traps focus and returns it at a narrow reduced-motion viewport', async ({
  page,
  browserName
}, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const amount = page.getByRole('textbox', { name: 'You pay', exact: true });
  await amount.fill('150');
  await amount.press('Enter');
  const review = page.getByRole('button', { name: 'Review purchase', exact: true });
  await expect(review).toBeVisible();
  // Safari on macOS uses Option-Tab for all controls without changing OS keyboard preferences.
  const nextControl = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  for (let tabs = 0; tabs < 16; tabs++) {
    if (await review.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press(nextControl);
  }
  await expect(review).toBeFocused();
  await unobstructed(review);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Review purchase', exact: true });
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  const start = dialog.getByRole('button', { name: 'Start demo trade', exact: true });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(start).toBeFocused();
  await unobstructed(start);
  await noOverflow(page);
  await evidence(page, info, 'light', 'keyboard-review-narrow', true);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(review).toBeFocused();
  await noOverflow(page);
});

test('a delayed-payment scenario permits dispute review and cannot invite a second transfer or refund', async ({
  page
}, info) => {
  await open(page);
  await chooseScenario(page, 'delayed_payment');
  const title = page.getByRole('heading', {
    name: 'Payment sent. Waiting for the seller.',
    exact: true
  });
  await expect(title).toBeVisible();
  await expect(page.getByText('No second payment needed', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Request cancellation and refund', exact: true })
  ).toHaveCount(0);
  await title.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await evidence(page, info, 'light', 'payment-delay');
  await page.getByRole('button', { name: 'There is a problem', exact: true }).click();
  const dispute = page.getByRole('dialog', { name: 'Pause and get help', exact: true });
  await expect(
    dispute.getByText(
      'This simulates a dispute. It does not contact support or resolve who owns the escrow.',
      { exact: true }
    )
  ).toBeVisible();
  await dispute.getByRole('button', { name: 'Simulate opening a dispute', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Trade paused for review', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Simulate release and confirmation', exact: true })
  ).toHaveCount(0);
  await expect(page.getByText(/No support request was sent from this preview/)).toBeVisible();
});

test('a seeded receipt review never pre-approves receipt, and restart clears its acknowledgement', async ({
  page
}, info) => {
  await open(page);
  await chooseScenario(page, 'seller_receipt');
  await expect(
    page.getByRole('heading', { name: 'Has the money reached your bank?', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review payment and release', exact: true }).click();
  const receipt = page.getByRole('dialog', { name: 'Confirm receipt before release', exact: true });
  const checkbox = receipt.getByRole('checkbox', {
    name: 'I checked the matching payment in my bank account.',
    exact: true
  });
  const release = receipt.getByRole('button', {
    name: 'Confirm demo receipt and release',
    exact: true
  });
  await expect(checkbox).not.toBeChecked();
  await expect(release).toBeDisabled();
  await checkbox.check();
  await page.keyboard.press('Escape');
  await chooseScenario(page, 'seller_receipt');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review payment and release', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(release).toBeDisabled();
  await checkbox.scrollIntoViewIfNeeded();
  await evidence(page, info, 'light', 'seeded-receipt', true);
});

test('closing scenario selection preserves the active trade; starting another resets it', async ({
  page
}, info) => {
  await open(page);
  await chooseScenario(page, 'delayed_payment');
  const activeTitle = page.getByRole('heading', {
    name: 'Payment sent. Waiting for the seller.',
    exact: true
  });
  await expect(activeTitle).toBeVisible();
  const dialog = await scenarioDialog(page);
  await expect(
    dialog.getByText(
      'Starting a scenario clears this demo’s progress. Your wallet and real money are unaffected.',
      { exact: true }
    )
  ).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Test scenario', exact: true }).selectOption('sell');
  await evidence(page, info, 'light', 'reset-dialog', true);
  await dialog.getByRole('button', { name: 'Keep current demo', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(activeTitle).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Simulate release and confirmation', exact: true })
  ).toBeVisible();
  await chooseScenario(page, 'sell');
  await expect(activeTitle).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'You receive', exact: true })).toHaveValue('150');
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review sale', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an extra fiat decimal is rejected without rounding and a valid cent amount recovers', async ({
  page
}) => {
  await open(page);
  await chooseScenario(page, 'buy');
  const amount = page.getByRole('textbox', { name: 'You pay', exact: true });
  await amount.fill('50.001');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Enter €50–€250 with at most two decimal places.', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toHaveCount(0);
  await amount.fill('50.01');
  await expect(amount).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toBeVisible();
});

test('refund rehearsal waits for confirmation and a late payment claim freezes the refund', async ({
  page
}) => {
  await open(page);
  await chooseScenario(page, 'refund');
  await expect(page.getByRole('heading', { name: 'Refund requested', exact: true })).toBeVisible();
  await expect(page.getByText(/A refund request does not mean bitcoin has returned/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bitcoin refunded', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Simulate confirmed refund', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bitcoin refunded', exact: true })).toBeVisible();
  await expect(
    page.getByText('Refund confirmed in the simulation. No money moved.', { exact: true })
  ).toBeVisible();
  await chooseScenario(page, 'refund');
  await page.getByRole('button', { name: 'Simulate late payment claim', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Trade paused for review', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Simulate confirmed refund', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Simulate release and confirmation', exact: true })
  ).toHaveCount(0);
});

test('an unavailable-provider rehearsal recovers with a new sample scenario and clears the error', async ({
  page
}) => {
  await open(page);
  await chooseScenario(page, 'unavailable');
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
  await expect(
    page
      .getByRole('alert')
      .getByText('Offers are unavailable. Your wallet is unaffected. Try again.', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toHaveCount(0);
  await chooseScenario(page, 'buy');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toBeVisible();
});

test('reload and navigation discard the rehearsal without retaining an active trade or acknowledgement', async ({
  page
}) => {
  await open(page);
  await chooseScenario(page, 'delayed_payment');
  await expect(
    page.getByRole('heading', { name: 'Payment sent. Waiting for the seller.', exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Trade bitcoin', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'You pay', exact: true })).toHaveValue('150');
  await expect(page.getByRole('button', { name: 'Test scenarios', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Payment sent. Waiting for the seller.', exact: true })
  ).toHaveCount(0);
  await chooseScenario(page, 'seller_receipt');
  await page.goto('/');
  await page.goto('/marketplace');
  await expect(page.getByRole('textbox', { name: 'You pay', exact: true })).toHaveValue('150');
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await noOverflow(page);
});
