import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appVersion = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
type Theme = 'light' | 'dark';
const localizedCopy = {
  en: { heading: 'Trade bitcoin', preview: 'Design preview' },
  fr: { heading: 'Échanger du bitcoin', preview: 'Aperçu de l’interface' },
  es: { heading: 'Intercambiar bitcoin', preview: 'Vista previa del diseño' }
} as const;
type Language = keyof typeof localizedCopy;

async function openMarketplace(page: Page, theme: Theme, language: Language = 'en') {
  await page.addInitScript(
    ({ version, theme, language }) => {
      localStorage.setItem('groot-language', language);
      localStorage.setItem('groot-theme', theme);
      localStorage.setItem('groot-notes-dismissed-version', version);
    },
    { version: appVersion, theme, language }
  );
  await page.goto('/marketplace');
  await expect(
    page.getByRole('heading', { name: localizedCopy[language].heading, exact: true })
  ).toBeVisible();
  await expect(page.getByText(localizedCopy[language].preview, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const copy of [
  {
    language: 'fr',
    find: 'Trouver une offre',
    estimate: 'Bitcoin que vous recevez, estimé',
    review: 'Vérifier l’achat',
    start: 'Démarrer l’échange fictif',
    amount: 'Vous payez'
  },
  {
    language: 'es',
    find: 'Buscar una oferta',
    estimate: 'Bitcoin que recibes, estimado',
    review: 'Revisar compra',
    start: 'Iniciar intercambio de demostración',
    amount: 'Pagas'
  }
] as const) {
  test(`marketplace localized purchase review (${copy.language})`, async ({ page }, info) => {
    await openMarketplace(page, 'light', copy.language);
    await expect(page.getByRole('textbox', { name: copy.amount, exact: true })).toHaveValue('150');
    await page.getByRole('button', { name: copy.find, exact: true }).click();
    await expect(page.getByText(copy.estimate, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: copy.review, exact: true }).click();
    const review = page.getByRole('dialog', { name: copy.review, exact: true });
    await expect(review.getByRole('button', { name: copy.start, exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toHaveCount(0);
    await evidence(page, info, 'light', `localized-review-${copy.language}`);
    await expectNoOverflow(page);
  });
}

test('marketplace quote selection and input changes invalidate stale estimates', async ({
  page
}) => {
  await openMarketplace(page, 'light');
  await expect(page.getByRole('button', { name: 'Buy bitcoin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('button', { name: 'Sell bitcoin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await findOffers(page);
  await expect(page.getByText('Best total', { exact: true })).toBeVisible();
  await page.getByText('Other matching offers', { exact: true }).click();
  await page.getByRole('button', { name: /^Cedar/ }).click();
  await expect(page.getByRole('button', { name: /^Cedar/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('button', { name: /^River/ })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect(page.getByText('Cedar', { exact: true })).toBeVisible();
  await expect(page.getByText('Best total', { exact: true })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'You pay', exact: true }).fill('200');
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toHaveCount(0);
  await expect(page.getByText('Cedar', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeVisible();
  await findOffers(page);
  await expect(page.getByText('Best total', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sell bitcoin', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Buy bitcoin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect(page.getByRole('button', { name: 'Sell bitcoin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review sale', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'You receive', exact: true })).toHaveValue('200');
  await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review sale', exact: true })).toBeVisible();
  await expectNoOverflow(page);
});

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}

async function evidence(page: Page, info: TestInfo, theme: Theme, name: string) {
  await expectNoOverflow(page);
  const directory = process.env.MARKETPLACE_EVIDENCE_DIR;
  if (directory) mkdirSync(directory, { recursive: true });
  const filename = `marketplace-${info.project.name}-${theme}-${name}.png`;
  const path = directory ? resolve(directory, filename) : info.outputPath(filename);
  await page.screenshot({ path, animations: 'disabled', scale: 'css' });
  await info.attach(filename, { path, contentType: 'image/png' });
  if (name === 'buy-offers' || name === 'seller-receipt') {
    const fullFilename = filename.replace('.png', '-full.png');
    const fullPath = directory ? resolve(directory, fullFilename) : info.outputPath(fullFilename);
    await page.screenshot({ path: fullPath, animations: 'disabled', scale: 'css', fullPage: true });
    await info.attach(fullFilename, { path: fullPath, contentType: 'image/png' });
  }
}

async function findOffers(page: Page, intent: 'buy' | 'sell' = 'buy') {
  if (intent === 'sell') {
    await page.getByRole('button', { name: 'Sell bitcoin', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: intent === 'buy' ? 'Review purchase' : 'Review sale',
      exact: true
    })
  ).toBeVisible();
}

async function startTrade(page: Page, intent: 'buy' | 'sell' = 'buy') {
  await findOffers(page, intent);
  const title = intent === 'buy' ? 'Review purchase' : 'Review sale';
  await page.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Start demo trade', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'First, secure the bitcoin', exact: true })
  ).toBeVisible();
}

async function confirmEscrow(page: Page) {
  await page.getByRole('button', { name: 'Simulate confirmed escrow', exact: true }).click();
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`marketplace preview (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await openMarketplace(page, theme);
    });

    test('buyer completes the preview only after escrow and payment confirmation', async ({
      page
    }, info) => {
      const externalRequests: string[] = [];
      page.on('request', (request) => {
        if (/hodlhodl|hhtestnet/.test(new URL(request.url()).hostname))
          externalRequests.push(request.url());
      });
      await findOffers(page);
      await expect(page.getByText('Estimated bitcoin you receive', { exact: true })).toBeVisible();
      const reviewPurchase = page.getByRole('button', { name: 'Review purchase', exact: true });
      if (info.project.name === 'mobile') await reviewPurchase.scrollIntoViewIfNeeded();
      await expect(reviewPurchase).toBeInViewport({ ratio: 1 });
      await evidence(page, info, theme, 'buy-offers');
      await page.getByRole('button', { name: 'Review purchase', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review purchase', exact: true });
      await expect(
        review.getByText('The buyer pays after Bitcoin confirmations.', { exact: true })
      ).toBeVisible();
      await evidence(page, info, theme, 'review');
      await review.getByRole('button', { name: 'Start demo trade', exact: true }).click();

      await expect(
        page.getByRole('heading', { name: 'First, secure the bitcoin', exact: true })
      ).toBeVisible();
      await expect(page.getByText('Do not send a bank payment yet', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Mark demo payment as sent', exact: true })
      ).toHaveCount(0);
      await confirmEscrow(page);
      await expect(
        page.getByRole('heading', { name: 'Bitcoin secured. Time to pay.', exact: true })
      ).toBeVisible();
      await expect(page.getByText('Pay from your own bank account', { exact: true })).toBeVisible();
      await evidence(page, info, theme, 'buyer-payment');

      await page.getByRole('button', { name: 'Mark demo payment as sent', exact: true }).click();
      const payment = page.getByRole('dialog', { name: 'Mark payment as sent?', exact: true });
      const confirmPayment = payment.getByRole('button', {
        name: 'Confirm demo payment sent',
        exact: true
      });
      await expect(confirmPayment).toBeDisabled();
      await evidence(page, info, theme, 'buyer-payment-confirmation');
      await payment
        .getByRole('checkbox', {
          name: 'I understand the buyer’s claim does not prove receipt.',
          exact: true
        })
        .check();
      await expect(confirmPayment).toBeEnabled();
      await confirmPayment.click();
      await expect(
        page.getByRole('heading', { name: 'Payment sent. Waiting for the seller.', exact: true })
      ).toBeVisible();
      await expect(page.getByText('No second payment needed', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Request cancellation and refund', exact: true })
      ).toHaveCount(0);
      await page
        .getByRole('button', { name: 'Simulate release and confirmation', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Trade complete', exact: true })
      ).toBeVisible();
      await expect(page.getByText('Demo completed', { exact: true })).toBeVisible();
      await expectNoOverflow(page);
      expect(externalRequests).toEqual([]);
    });

    test('seller checks bank receipt before release and still waits for Bitcoin confirmation', async ({
      page
    }, info) => {
      await startTrade(page, 'sell');
      await expect(
        page.getByText(/A live sale requires a separate Groot transaction review/)
      ).toBeVisible();
      await confirmEscrow(page);
      await expect(
        page.getByRole('heading', { name: 'Waiting for the buyer’s transfer', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Simulate buyer payment claim', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Has the money reached your bank?', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Simulate release and confirmation', exact: true })
      ).toHaveCount(0);
      await evidence(page, info, theme, 'seller-receipt');

      await page.getByRole('button', { name: 'Review payment and release', exact: true }).click();
      const receipt = page.getByRole('dialog', {
        name: 'Confirm receipt before release',
        exact: true
      });
      const release = receipt.getByRole('button', {
        name: 'Confirm demo receipt and release',
        exact: true
      });
      const checkbox = receipt.getByRole('checkbox', {
        name: 'I checked the matching payment in my bank account.',
        exact: true
      });
      await expect(release).toBeDisabled();
      await expect(receipt.getByText(/Releasing bitcoin is irreversible/)).toBeVisible();
      await checkbox.scrollIntoViewIfNeeded();
      expect(
        await checkbox.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) ===
            element
          );
        })
      ).toBe(true);
      await evidence(page, info, theme, 'seller-receipt-confirmation');
      await checkbox.check();
      await expect(release).toBeEnabled();
      await receipt.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(receipt).toBeHidden();
      await page.getByRole('button', { name: 'Review payment and release', exact: true }).click();
      await expect(checkbox).not.toBeChecked();
      await expect(release).toBeDisabled();
      await checkbox.check();
      await release.click();

      await expect(
        page.getByRole('heading', { name: 'Releasing the bitcoin', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Trade complete', exact: true })).toHaveCount(
        0
      );
      await page
        .getByRole('button', { name: 'Simulate release and confirmation', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Trade complete', exact: true })
      ).toBeVisible();
      await expectNoOverflow(page);
    });

    test('dispute pauses release and preserves a visible result', async ({ page }, info) => {
      await startTrade(page, 'sell');
      await confirmEscrow(page);
      await page.getByRole('button', { name: 'Simulate buyer payment claim', exact: true }).click();
      await page.getByRole('button', { name: 'There is a problem', exact: true }).click();
      const dispute = page.getByRole('dialog', { name: 'Pause and get help', exact: true });
      await expect(
        dispute.getByText(/does not contact support or resolve who owns the escrow/)
      ).toBeVisible();
      await dispute
        .getByRole('button', { name: 'Simulate opening a dispute', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Trade paused for review', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Trade progress', exact: true })
      ).toHaveCount(0);
      await expect(page.getByText('Release is paused', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /release|refund|payment claim/i })).toHaveCount(
        0
      );
      await expect(page.getByRole('button', { name: 'Back to offers', exact: true })).toBeVisible();
      await evidence(page, info, theme, 'dispute');
    });

    test('pre-funding cancellation returns to offers without implying a refund', async ({
      page
    }) => {
      await startTrade(page);
      await page.getByRole('button', { name: 'Cancel demo trade', exact: true }).click();
      await expect(
        page.getByRole('navigation', { name: 'Trade progress', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Trade cancelled', exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('Cancelled before escrow funding. No money moved.', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Bitcoin refunded', exact: true })
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Back to offers', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Find an offer', exact: true })).toBeVisible();
    });

    test('funded cancellation stays pending until the refund is confirmed', async ({ page }) => {
      await startTrade(page);
      await confirmEscrow(page);
      await page
        .getByRole('button', { name: 'Request cancellation and refund', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Refund requested', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Trade progress', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(/A refund request does not mean bitcoin has returned/)
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Bitcoin refunded', exact: true })
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Back to offers', exact: true })).toHaveCount(
        0
      );
      await page.getByRole('button', { name: 'Simulate confirmed refund', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Bitcoin refunded', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Trade progress', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText('Refund confirmed in the simulation. No money moved.', { exact: true })
      ).toBeVisible();
      await expectNoOverflow(page);
    });

    test('a late payment claim freezes a pending refund for dispute review', async ({ page }) => {
      await startTrade(page);
      await confirmEscrow(page);
      await page
        .getByRole('button', { name: 'Request cancellation and refund', exact: true })
        .click();
      await page.getByRole('button', { name: 'Simulate late payment claim', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Trade paused for review', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Simulate confirmed refund', exact: true })
      ).toHaveCount(0);
    });

    test('empty and offline conditions offer a successful retry', async ({ page }) => {
      // The successful search proves the client is hydrated before toggling native <details>.
      await findOffers(page);
      await page.getByText('Preview conditions', { exact: true }).click();
      const availability = page.getByRole('combobox', { name: 'Offer availability', exact: true });
      await expect(availability).toBeVisible();
      await availability.selectOption('empty');
      await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
      await expect(page.getByText('No matching offers', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toHaveCount(
        0
      );
      await expect(page.getByRole('button', { name: 'Refresh offers', exact: true })).toBeVisible();

      await availability.selectOption('offline');
      await page.getByRole('button', { name: 'Find an offer', exact: true }).click();
      await expect(
        page
          .getByRole('alert')
          .getByText('Offers are unavailable. Your wallet is unaffected. Try again.', {
            exact: true
          })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh offers', exact: true })).toHaveCount(
        0
      );
      await page.getByRole('button', { name: 'Restore demo offers', exact: true }).click();
      await expect(availability).toHaveValue('available');
      await expect(
        page.getByRole('button', { name: 'Review purchase', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expectNoOverflow(page);
    });

    test('invalid amount blocks search and a valid decimal restores it', async ({ page }) => {
      const amount = page.getByRole('textbox');
      const find = page.getByRole('button', { name: 'Find an offer', exact: true });
      for (const invalid of ['49.99', '250.01', '1e2', '-150', '150.001', '']) {
        await amount.fill(invalid);
        await expect(amount).toHaveAttribute('aria-invalid', 'true');
        await expect(find).toBeDisabled();
      }
      await amount.fill('150,25');
      await expect(amount).toHaveAttribute('aria-invalid', 'false');
      await expect(find).toBeEnabled();
      await find.click();
      await expect(
        page.getByRole('button', { name: 'Review purchase', exact: true })
      ).toBeVisible();
    });

    test('an expired estimate cannot start a trade and can be refreshed', async ({ page }) => {
      await page.clock.install({ time: new Date('2026-11-07T10:00:00Z') });
      await page.reload();
      await findOffers(page);
      await page.getByRole('button', { name: 'Review purchase', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review purchase', exact: true });
      await expect(
        review.getByRole('button', { name: 'Start demo trade', exact: true })
      ).toBeEnabled();
      await page.clock.fastForward(61_000);
      await expect(
        review.getByRole('button', { name: 'Start demo trade', exact: true })
      ).toBeDisabled();
      await expect(review.getByRole('status')).toContainText(
        'This estimate expired. Refresh offers before continuing.'
      );
      await review.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(review).toBeHidden();
      await expect(
        page.getByRole('heading', { name: 'First, secure the bitcoin', exact: true })
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Refresh offers', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Review purchase', exact: true })
      ).toBeVisible();
      await expectNoOverflow(page);
    });
  });
}
