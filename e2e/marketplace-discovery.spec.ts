import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const enabled = process.env.GROOT_MARKETPLACE_DISCOVERY === '1';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const routePath = '/marketplace/discover';
const lookupPath = '/__groot_marketplace/offers';
const anchor = new Date('2026-11-07T10:00:00Z');
const offerId = '12a45678-1234-4234-8234-123456789abc';
const alias = 'Synthetic EUR trader';
type Theme = 'light' | 'dark';
type Intent = 'buy' | 'sell';

function publicPayload(intent: Intent = 'buy', changes: Record<string, unknown> = {}) {
  return {
    provider: 'localcoinswap',
    payload: {
      count: 1,
      limit: 100,
      offset: 0,
      results: [
        {
          uuid: offerId,
          slug: 'synthetic-btc-eur-offer',
          coin_currency: { slug: 'BTC', symbol: 'BTC', is_crypto: true, token_standard: null },
          fiat_currency: { symbol: 'EUR', is_crypto: false, token_standard: null },
          trading_type: { slug: intent === 'buy' ? 'sell' : 'buy' },
          payment_method: { name: 'SEPA Instant', slug: 'sepa-instant' },
          min_trade_size: '50.0000000000',
          max_trade_size: '250.0000000000',
          price_formula_value: '74934.91572087927',
          minimum_feedback: '0',
          sms_required: false,
          enforced_sizes: '',
          created_by: {
            username: alias,
            user_uuid: '23a45678-1234-4234-9234-123456789abc',
            activity_status: 'active',
            last_seen: anchor.getTime() / 1000 - 30,
            completed_trades: 27,
            feedback_score: '5.00000'
          },
          ...changes
        }
      ]
    }
  };
}

async function fulfill(
  route: Route,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body)
  });
}

async function intercept(
  page: Page,
  responder: (route: Route, count: number) => Promise<void> = (route) =>
    fulfill(route, publicPayload())
) {
  const calls: { method: string; url: string }[] = [];
  const external: string[] = [];
  await page.route('**/__groot_marketplace/offers**', async (route) => {
    calls.push({ method: route.request().method(), url: route.request().url() });
    await responder(route, calls.length);
  });
  await page.route(
    /^https:\/\/(?:api\.)?(?:localcoinswap\.com|hodlhodl\.com)(?:\/|$)/,
    async (route) => {
      external.push(route.request().url());
      await route.abort('blockedbyclient');
    }
  );
  return { calls, external };
}

async function prepare(page: Page, theme: Theme = 'light', language: 'en' | 'fr' | 'es' = 'en') {
  await page.clock.install({ time: anchor });
  await page.addInitScript(
    ({ version, theme, language }) => {
      localStorage.setItem('groot-language', language);
      localStorage.setItem('groot-theme', theme);
      localStorage.setItem('groot-notes-dismissed-version', version);
    },
    { version, theme, language }
  );
}

async function open(page: Page) {
  await page.goto(routePath);
  await expect(
    page.getByRole('heading', { name: 'Public bitcoin listings', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Wallet demo · Never use real funds or recovery words', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Dummy data only · Never use real funds or recovery words', { exact: true })
  ).toHaveCount(0);
}

async function consent(page: Page) {
  await page.getByRole('button', { name: 'Find public listings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Read public listings?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Allow this lookup', exact: true }).click();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}

async function primaryActionIsReachable(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true });
  await expect(action).toBeInViewport({ ratio: 1 });
  expect(
    await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const navigation = document.querySelector('.mobile-nav');
      const bottom = navigation?.getClientRects().length
        ? navigation.getBoundingClientRect().top
        : window.innerHeight;
      const hit = document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2
      );
      return bounds.bottom <= bottom && element.contains(hit);
    })
  ).toBe(true);
}

async function evidence(page: Page, info: TestInfo, theme: Theme, name: string) {
  if (
    name !== 'privacy-consent' &&
    name !== 'source-confirmation' &&
    !name.startsWith('localized-source-')
  ) {
    await expect(page.locator('.modal-layer')).toHaveCount(0);
  }
  await noOverflow(page);
  const directory = process.env.MARKETPLACE_EVIDENCE_DIR;
  if (directory) mkdirSync(directory, { recursive: true });
  const filename = `marketplace-discovery-${info.project.name}-${theme}-${name}.png`;
  const path = directory ? resolve(directory, filename) : info.outputPath(filename);
  await page.screenshot({ path, animations: 'disabled', scale: 'css' });
  await info.attach(filename, { path, contentType: 'image/png' });
  if (name === 'listings') {
    const fullFilename = filename.replace('.png', '-full.png');
    const fullPath = directory ? resolve(directory, fullFilename) : info.outputPath(fullFilename);
    await page.screenshot({ path: fullPath, animations: 'disabled', scale: 'css', fullPage: true });
    await info.attach(fullFilename, { path: fullPath, contentType: 'image/png' });
  }
}

test('public discovery stays disabled unless the development flag is explicitly enabled', async ({
  page
}) => {
  test.skip(enabled, 'The default-off boundary is checked without the opt-in environment.');
  const observed = await intercept(page);
  await prepare(page);
  await open(page);
  await expect(page.getByText('Discovery is not enabled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find public listings', exact: true })).toHaveCount(
    0
  );
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to demo', exact: true })).toBeVisible();
  await page.clock.fastForward(61_000);
  expect(observed.calls).toEqual([]);
  expect(observed.external).toEqual([]);
});

test.describe('explicitly enabled read-only public discovery', () => {
  test.skip(
    !enabled,
    'Run with GROOT_MARKETPLACE_DISCOVERY=1 against an isolated development server.'
  );

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: startup, route entry, edits and dismissed consent never request listings`, async ({
      page
    }, info) => {
      const observed = await intercept(page);
      await prepare(page, theme);
      await page.goto('/');
      await page.clock.fastForward(3_000);
      expect(observed.calls).toEqual([]);
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('button', { name: 'Buy bitcoin', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(page.getByRole('button', { name: 'Sell bitcoin', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      await primaryActionIsReachable(page, 'Find public listings');
      await evidence(page, info, theme, 'first-view');
      await page.getByRole('textbox', { name: 'You pay', exact: true }).fill('100');
      await page.getByRole('button', { name: 'Sell bitcoin', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Buy bitcoin', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      await expect(page.getByRole('button', { name: 'Sell bitcoin', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await page.getByRole('textbox', { name: 'You receive', exact: true }).fill('200');
      await page.getByRole('button', { name: 'Find public listings', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Read public listings?', exact: true });
      await expect(dialog.getByText(/The euro amount is filtered locally/)).toBeVisible();
      await evidence(page, info, theme, 'privacy-consent');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await page.clock.fastForward(61_000);
      expect(observed.calls).toEqual([]);
      expect(observed.external).toEqual([]);
      await noOverflow(page);
    });

    test(`${theme}: one consented lookup shows indicative listings and a protected source confirmation`, async ({
      page
    }, info) => {
      const observed = await intercept(page);
      await prepare(page, theme);
      await open(page);
      await consent(page);
      await expect(page.getByText(alias, { exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await evidence(page, info, theme, 'listings-top');
      expect(observed.calls).toHaveLength(1);
      expect(observed.calls[0].method).toBe('GET');
      expect(new URL(observed.calls[0].url).pathname).toBe(lookupPath);
      expect(Object.fromEntries(new URL(observed.calls[0].url).searchParams)).toEqual({
        intent: 'buy',
        amountCents: '15000'
      });
      await expect(
        page.getByText('Indicative bitcoin amount before fees', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(
          'Platform, mining and banking fees are not included. This is not a net-receipt promise.',
          { exact: true }
        )
      ).toBeVisible();
      await page.getByText('Provider terms and eligibility', { exact: true }).click();
      await expect(
        page.getByText(
          'Country, account, identity and bank requirements still need checking with the provider.',
          { exact: true }
        )
      ).toBeVisible();
      const source = page.getByRole('button', { name: 'View source offer', exact: true });
      await source.scrollIntoViewIfNeeded();
      await expect(source).toBeInViewport({ ratio: 1 });
      await evidence(page, info, theme, 'listings');
      await expect(
        page
          .locator('.discovery-page')
          .getByRole('button', { name: /accept|sign|release|fund|start.*trade/i })
      ).toHaveCount(0);
      await source.click();
      const dialog = page.getByRole('dialog', { name: 'Open LocalCoinSwap?', exact: true });
      const original = dialog.getByRole('link', { name: 'Open original offer', exact: true });
      await expect(original).toHaveAttribute(
        'href',
        `https://localcoinswap.com/trade/synthetic-btc-eur-offer/${offerId}`
      );
      await expect(original).toHaveAttribute('target', '_blank');
      await expect(original).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(original).toHaveAttribute('referrerpolicy', 'no-referrer');
      await expect(
        dialog.getByText(
          'You are leaving Groot’s read-only area. The provider’s website can offer real trades. Groot has not reserved a price, checked eligibility or started a trade.',
          { exact: true }
        )
      ).toBeVisible();
      await evidence(page, info, theme, 'source-confirmation');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      expect(observed.external).toEqual([]);
    });

    test(`${theme}: expired listings cannot open a source, and refresh is explicit without polling`, async ({
      page
    }, info) => {
      const observed = await intercept(page);
      await prepare(page, theme);
      await open(page);
      await consent(page);
      const source = page.getByRole('button', { name: 'View source offer', exact: true });
      await expect(source).toBeEnabled();
      await source.click();
      const dialog = page.getByRole('dialog', { name: 'Open LocalCoinSwap?', exact: true });
      await expect(
        dialog.getByRole('link', { name: 'Open original offer', exact: true })
      ).toBeVisible();
      await page.clock.fastForward(61_000);
      await expect(
        dialog.getByRole('link', { name: 'Open original offer', exact: true })
      ).toHaveCount(0);
      await expect(
        dialog.getByText('These listings are stale. Refresh before viewing a source offer.', {
          exact: true
        })
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(source).toBeDisabled();
      await source.scrollIntoViewIfNeeded();
      await evidence(page, info, theme, 'stale-listings');
      expect(observed.calls).toHaveLength(1);
      await page.getByRole('button', { name: 'Refresh public listings', exact: true }).click();
      await expect(source).toBeEnabled();
      expect(observed.calls).toHaveLength(2);
      expect(observed.external).toEqual([]);
    });
  }

  for (const copy of [
    {
      language: 'fr',
      heading: 'Annonces publiques de bitcoin',
      banner:
        'Portefeuille de démonstration · N’utilisez jamais de vrais fonds ni mots de récupération',
      oldBanner:
        'Données fictives uniquement · N’utilisez jamais de vrais fonds ni mots de récupération',
      find: 'Rechercher des annonces publiques',
      consent: 'Consulter les annonces publiques ?',
      allow: 'Autoriser cette recherche',
      indicative: 'Montant indicatif en bitcoin avant frais',
      source: 'Voir l’annonce d’origine',
      confirm: 'Ouvrir LocalCoinSwap ?',
      original: 'Ouvrir l’annonce d’origine'
    },
    {
      language: 'es',
      heading: 'Anuncios públicos de bitcoin',
      banner: 'Cartera de demostración · Nunca uses fondos ni palabras de recuperación reales',
      oldBanner: 'Solo datos ficticios · Nunca uses fondos ni palabras de recuperación reales',
      find: 'Buscar anuncios públicos',
      consent: '¿Consultar anuncios públicos?',
      allow: 'Permitir esta consulta',
      indicative: 'Importe indicativo en bitcoin antes de comisiones',
      source: 'Ver anuncio original',
      confirm: '¿Abrir LocalCoinSwap?',
      original: 'Abrir anuncio original'
    }
  ] as const) {
    test(`localized discovery and source review (${copy.language})`, async ({ page }, info) => {
      const observed = await intercept(page);
      await prepare(page, 'light', copy.language);
      await page.goto(routePath);
      await expect(page.getByRole('heading', { name: copy.heading, exact: true })).toBeVisible();
      await expect(page.getByText(copy.banner, { exact: true })).toBeVisible();
      await expect(page.getByText(copy.oldBanner, { exact: true })).toHaveCount(0);
      await primaryActionIsReachable(page, copy.find);
      await page.getByRole('button', { name: copy.find, exact: true }).click();
      const consentDialog = page.getByRole('dialog', { name: copy.consent, exact: true });
      await consentDialog.getByRole('button', { name: copy.allow, exact: true }).click();
      await expect(page.getByText(copy.indicative, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: copy.source, exact: true }).click();
      const sourceDialog = page.getByRole('dialog', { name: copy.confirm, exact: true });
      await expect(
        sourceDialog.getByRole('link', { name: copy.original, exact: true })
      ).toHaveAttribute('target', '_blank');
      await evidence(page, info, 'light', `localized-source-${copy.language}`);
      await page.keyboard.press('Escape');
      await expect(sourceDialog).toBeHidden();
      expect(observed.calls).toHaveLength(1);
      expect(observed.external).toEqual([]);
    });
  }

  test('amount validation and direction changes clear old listings and only explicit searches fetch again', async ({
    page
  }) => {
    const observed = await intercept(page, (route) => {
      const intent = new URL(route.request().url()).searchParams.get('intent') as Intent;
      return fulfill(route, publicPayload(intent));
    });
    await prepare(page);
    await open(page);
    const input = page.getByRole('textbox', { name: 'You pay', exact: true });
    for (const amount of ['49.99', '250.01', '1e2', '-100', '']) {
      await input.fill(amount);
      await expect(
        page.getByRole('button', { name: 'Find public listings', exact: true })
      ).toBeDisabled();
    }
    expect(observed.calls).toEqual([]);
    await input.fill('100');
    await consent(page);
    await expect(page.getByText(alias, { exact: true })).toBeVisible();
    await input.fill('200');
    await expect(page.getByText(alias, { exact: true })).toHaveCount(0);
    expect(observed.calls).toHaveLength(1);
    await page.getByRole('button', { name: 'Sell bitcoin', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'You receive', exact: true })).toHaveValue(
      '200'
    );
    await page.getByRole('button', { name: 'Find public listings', exact: true }).click();
    await expect(page.getByText(alias, { exact: true })).toBeVisible();
    expect(observed.calls).toHaveLength(2);
    expect(new URL(observed.calls[1].url).searchParams.get('intent')).toBe('sell');
    expect(observed.external).toEqual([]);
  });

  test('long provider trader names remain readable within the viewport', async ({ page }, info) => {
    const payload = publicPayload();
    const longAlias = `SyntheticTrader${'x'.repeat(135)}`;
    payload.payload.results[0].created_by.username = longAlias;
    const observed = await intercept(page, (route) => fulfill(route, payload));
    await prepare(page);
    await open(page);
    await consent(page);
    const name = page.getByText(longAlias, { exact: true });
    await expect(name).toBeVisible();
    await name.scrollIntoViewIfNeeded();
    await noOverflow(page);
    expect(
      await name.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth)
    ).toBe(true);
    await evidence(page, info, 'light', 'long-trader-name');
    expect(observed.calls).toHaveLength(1);
    expect(observed.external).toEqual([]);
  });

  test('editing an amount aborts a pending request and ignores its late response', async ({
    page
  }) => {
    let release: (() => Promise<void>) | undefined;
    const observed = await intercept(
      page,
      (route) =>
        new Promise<void>((resolve) => {
          release = async () => {
            await fulfill(route, publicPayload()).catch(() => {});
            resolve();
          };
        })
    );
    await prepare(page);
    await open(page);
    await consent(page);
    await expect.poll(() => observed.calls.length).toBe(1);
    await page.getByRole('textbox', { name: 'You pay', exact: true }).fill('200');
    await release!();
    await expect(page.getByText(alias, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Find public listings', exact: true })
    ).toBeEnabled();
    expect(observed.calls).toHaveLength(1);
    expect(observed.external).toEqual([]);
  });

  test('cancel and stop clear pending results; stopping requires fresh consent', async ({
    page
  }) => {
    const releases: (() => Promise<void>)[] = [];
    const observed = await intercept(
      page,
      (route) =>
        new Promise<void>((resolve) => {
          releases.push(async () => {
            await fulfill(route, publicPayload()).catch(() => {});
            resolve();
          });
        })
    );
    await prepare(page);
    await open(page);
    await consent(page);
    await expect.poll(() => observed.calls.length).toBe(1);
    await page.getByRole('button', { name: 'Cancel lookup', exact: true }).click();
    await expect(
      page.locator('.discovery-page').getByText('Offer lookup cancelled.', { exact: true })
    ).toBeVisible();
    await releases[0]();
    await expect(page.getByText(alias, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Find public listings', exact: true }).click();
    await expect.poll(() => observed.calls.length).toBe(2);
    await page
      .getByRole('button', { name: 'Stop discovery and clear listings', exact: true })
      .click();
    await expect(
      page
        .locator('.discovery-page')
        .getByText('Discovery stopped. No further provider requests will be made.', { exact: true })
    ).toBeVisible();
    await releases[1]();
    await page.clock.fastForward(61_000);
    await expect(page.getByText(alias, { exact: true })).toHaveCount(0);
    expect(observed.calls).toHaveLength(2);
    await page.getByRole('button', { name: 'Find public listings', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Read public listings?', exact: true })
    ).toBeVisible();
    expect(observed.calls).toHaveLength(2);
    expect(observed.external).toEqual([]);
  });

  test('leaving discovery cancels pending work and never retains lookup consent', async ({
    page
  }) => {
    let release: (() => Promise<void>) | undefined;
    const observed = await intercept(
      page,
      (route) =>
        new Promise<void>((resolve) => {
          release = async () => {
            await fulfill(route, publicPayload()).catch(() => {});
            resolve();
          };
        })
    );
    await prepare(page);
    await open(page);
    await consent(page);
    await expect.poll(() => observed.calls.length).toBe(1);
    await page.getByRole('link', { name: 'Back to demo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trade bitcoin', exact: true })).toBeVisible();
    await release!();
    await page.clock.fastForward(61_000);
    expect(observed.calls).toHaveLength(1);
    await open(page);
    await page.getByRole('button', { name: 'Find public listings', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Read public listings?', exact: true })
    ).toBeVisible();
    expect(observed.calls).toHaveLength(1);
    expect(observed.external).toEqual([]);
  });

  for (const failure of ['offline', 'malformed'] as const) {
    test(`${failure} lookup preserves an inline result and recovers only after a manual retry`, async ({
      page
    }, info) => {
      const observed = await intercept(page, async (route, count) => {
        if (count > 1) return fulfill(route, publicPayload());
        if (failure === 'offline') return route.abort('internetdisconnected');
        return fulfill(route, { provider: 'hodlhodl', payload: { status: 'success', offers: [] } });
      });
      await prepare(page);
      await open(page);
      await consent(page);
      const message =
        failure === 'offline'
          ? 'Public listings are unavailable. Try again; the demo still works.'
          : 'The provider response could not be verified. No listings are shown.';
      const warning = page
        .locator('.discovery-page')
        .getByRole('alert')
        .filter({ hasText: message });
      await expect(warning).toBeVisible();
      await expect(page.locator('.modal-layer')).toHaveCount(0);
      await warning.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await evidence(page, info, 'light', `${failure}-failure`);
      await page.clock.fastForward(61_000);
      expect(observed.calls).toHaveLength(1);
      await page.getByRole('button', { name: 'Find public listings', exact: true }).click();
      await expect(page.getByText(alias, { exact: true })).toBeVisible();
      expect(observed.calls).toHaveLength(2);
      expect(observed.external).toEqual([]);
    });
  }

  test('a provider cooldown disables retries until Retry-After and performs no automatic request', async ({
    page
  }) => {
    const observed = await intercept(page, (route, count) =>
      count === 1
        ? fulfill(route, { code: 'rate_limited' }, 429, { 'Retry-After': '60' })
        : fulfill(route, publicPayload())
    );
    await prepare(page);
    await open(page);
    await consent(page);
    await expect(
      page
        .locator('.discovery-page')
        .getByRole('alert')
        .filter({ hasText: 'The provider asked us to wait. Try again after the cooldown.' })
    ).toBeVisible();
    const retry = page.getByRole('button', { name: 'Find public listings', exact: true });
    await expect(retry).toBeDisabled();
    await page.clock.fastForward(59_000);
    await expect(retry).toBeDisabled();
    expect(observed.calls).toHaveLength(1);
    await page.clock.fastForward(2_000);
    await expect(retry).toBeEnabled();
    expect(observed.calls).toHaveLength(1);
    await retry.click();
    await expect(page.getByText(alias, { exact: true })).toBeVisible();
    expect(observed.calls).toHaveLength(2);
    expect(observed.external).toEqual([]);
  });

  test('an empty or publicly restricted book stays empty without synthetic fallback', async ({
    page
  }, info) => {
    const observed = await intercept(page, (route, count) =>
      count === 1
        ? fulfill(route, { provider: 'localcoinswap', payload: { count: 0, results: [] } })
        : fulfill(route, publicPayload('buy', { sms_required: true }))
    );
    await prepare(page);
    await open(page);
    await consent(page);
    await expect(page.getByText('No matching public listings', { exact: true })).toBeVisible();
    await expect(page.locator('.modal-layer')).toHaveCount(0);
    await page
      .getByText('No matching public listings', { exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await evidence(page, info, 'light', 'empty-book');
    await expect(page.getByRole('button', { name: 'View source offer', exact: true })).toHaveCount(
      0
    );
    await page.getByRole('button', { name: 'Refresh public listings', exact: true }).click();
    await expect(page.getByText('No matching public listings', { exact: true })).toBeVisible();
    await expect(page.getByText(alias, { exact: true })).toHaveCount(0);
    expect(observed.calls).toHaveLength(2);
    expect(observed.external).toEqual([]);
    await noOverflow(page);
  });
});
