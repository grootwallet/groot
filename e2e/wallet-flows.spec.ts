import { expect, test } from '@playwright/test';

const recoveryWords = 'adapt cactus lesson motor acoustic globe ribbon pluck vessel deputy crisp fossil harbor pencil drift copper museum twelve gentle oak fabric north silent width';

test('creates a 24-word wallet and clears onboarding secrets', async ({ page }) => {
  await page.goto('/welcome?fixture-empty=1');
  await page.getByRole('button', { name: 'Create new wallet' }).click();
  await page.getByRole('button', { name: 'Generate recovery words' }).click();
  await expect(page.locator('.mnemonic-grid > div')).toHaveCount(24);
  await expect(page.getByRole('button', { name: 'I wrote them down' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reveal words' }).click();
  await page.getByRole('button', { name: 'I wrote them down' }).click();
  await expect(page.getByRole('heading', { name: 'Protect your wallet' })).toBeVisible();
  await expect(page.getByText('Backup confirmed')).toHaveCount(0);
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('new-wallet-pin');
  await page.getByRole('button', { name: 'Show Passphrase / PIN' }).click();
  await expect(page.getByLabel('Passphrase / PIN', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide Passphrase / PIN' }).click();
  await expect(page.getByRole('button', { name: 'Create wallet' })).toBeDisabled();
  await page.getByLabel('Confirm passphrase / PIN', { exact: true }).fill('different-pin');
  await expect(page.getByText('Passphrases do not match.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create wallet' })).toBeDisabled();
  await page.getByLabel('Confirm passphrase / PIN', { exact: true }).fill('new-wallet-pin');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('recovers exactly 24 words and unlock rejects the wrong credential', async ({ page }) => {
  await page.goto('/welcome?fixture-empty=1');
  await page.getByRole('button', { name: 'Recover wallet' }).click();
  await page.getByLabel('Recovery words').fill(recoveryWords.split(' ').slice(0, 23).join(' '));
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('prototype-passphrase');
  await expect(page.getByRole('button', { name: 'Recover wallet' })).toBeDisabled();
  await page.getByLabel('Recovery words').fill(recoveryWords);
  await page.getByRole('button', { name: 'Recover wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.goto('/unlock');
  await page.getByRole('button', { name: 'Show Passphrase / PIN' }).click();
  await expect(page.getByLabel('Passphrase / PIN', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await expect(page.getByText('Incorrect passphrase / PIN.')).toBeVisible();
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('existing wallet can exit add-wallet and locked screens without onboarding', async ({ page }) => {
  await page.goto('/welcome?add=1');
  await expect(page.getByRole('button', { name: 'Close wallet setup' })).toBeVisible();
  await page.getByRole('button', { name: 'Create new wallet' }).click();
  await page.getByRole('button', { name: 'Close wallet setup' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.goto('/unlock');
  await page.getByRole('button', { name: 'Wallets' }).click();
  await expect(page.getByRole('button', { name: 'Close wallet setup' })).toBeVisible();
});

test('creates, switches, unlocks, and deletes isolated wallet profiles', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Add wallet/ }).click();
  await page.getByRole('button', { name: 'Create new wallet' }).click();
  await page.getByRole('button', { name: 'Generate recovery words' }).click();
  await page.getByRole('button', { name: 'Reveal words' }).click();
  await page.getByRole('button', { name: 'I wrote them down' }).click();
  await page.getByLabel('Wallet name').fill('Savings wallet');
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('savings-passphrase');
  await page.getByLabel('Confirm passphrase / PIN', { exact: true }).fill('savings-passphrase');
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: /Savings wallet/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Everyday wallet/ })).toBeVisible();
  await page.getByRole('button', { name: /Everyday wallet/ }).click();
  await expect(page).toHaveURL(/\/unlock/);
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: 'Unlock wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: /Everyday wallet/ }).locator('svg')).toHaveCount(2);
});

test('overview, activity, UTXOs, and settings expose durable states', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: /Invoice #104/ }).click();
  await expect(page.getByRole('heading', { name: 'Transaction details' })).toBeVisible();
  await expect(page.getByText('Transaction ID', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await page.getByRole('button', { name: 'Received' }).click();
  await expect(page.getByText('Invoice #104')).toBeVisible();
  await page.getByRole('button', { name: /Invoice #104/ }).click();
  await expect(page.getByRole('heading', { name: 'Transaction details' })).toBeVisible();
  await expect(page.getByText('Confirmations', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: 'Coins' }).click();
  await expect(page.getByRole('heading', { name: 'Coins' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('Delete wallet', { exact: true })).toBeVisible();
});

test('activity explains its empty state', async ({ page }) => {
  await page.goto('/activity?fixture-empty-activity=1');
  await expect(page.getByRole('heading', { name: 'No transactions yet' })).toBeVisible();
  await expect(page.getByText('Payments you send and receive will appear here.')).toBeVisible();
});

test('receive keeps multiple labeled payment requests and discards them independently', async ({ page }) => {
  await page.goto('/receive');
  await page.getByRole('button', { name: 'New receive address' }).click();
  await expect(page.getByRole('button', { name: 'Generate address' })).toBeDisabled();
  await page.getByLabel('Permanent label').fill('Invoice #205');
  await page.getByRole('button', { name: 'Generate address' }).click();
  await expect(page.locator('.receive-card').getByText('Invoice #205', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code for/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enlarge QR code' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: /Large QR code/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Show address details' }).click();
  await expect(page.getByText("m/84'/1'/0'/0/9")).toBeVisible();
  await page.getByRole('button', { name: 'New receive address' }).click();
  await page.getByLabel('Permanent label').fill('Invoice #206');
  await page.getByRole('button', { name: 'Generate address' }).click();
  await expect(page.getByText('3 active addresses')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Invoice #205' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Invoice #206' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard Invoice #205' }).click();
  await page.getByRole('button', { name: 'Discard address' }).click();
  await expect(page.getByRole('button', { name: 'View Invoice #205' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'View Invoice #206' })).toBeVisible();
  await expect(page.getByText('2 active addresses')).toBeVisible();
});

test('coin control selects, freezes, and carries coins into send', async ({ page }) => {
  await page.goto('/coins');
  const first = page.getByRole('checkbox', { name: /Select Savings/ });
  await first.check();
  await expect(page.getByText('1 selected')).toBeVisible();
  await expect(page.getByText('1,250,000 sats selected')).toBeVisible();
  await page.getByRole('button', { name: 'Freeze selected' }).click();
  await expect(page.getByText('Frozen', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Unfreeze Savings' }).click();
  await first.check();
  await page.getByRole('link', { name: 'Send selected coins' }).click();
  await expect(page).toHaveURL(/\/send\?coins=/);
  await expect(page.getByText('Manual · 1 coin')).toBeVisible();
  await page.getByRole('button', { name: /Manual · 1 coin/ }).click();
  await page.getByRole('button', { name: 'Use automatic selection' }).click();
  await expect(page.locator('.coin-mode').getByText('Automatic selection', { exact: true })).toBeVisible();
});

test('send reviews a proposal and rejects a wrong credential', async ({ page }) => {
  await page.goto('/send');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Amount').fill('25000');
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByText('25,000')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to sign' }).click();
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();
  await expect(page.getByText('Incorrect passphrase / PIN.')).toBeVisible();
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment sent' })).toBeVisible();
  await expect(page.getByText('Transaction ID')).toBeVisible();
});

test('an address copied from Receive completes the browser send flow', async ({ page }) => {
  await page.goto('/receive');
  const receiveAddress = await page.locator('.receive-card .address-box code').innerText();
  await page.goto('/send');
  await page.getByLabel('Bitcoin address').fill(receiveAddress);
  await expect(page.getByText(/Enter a valid .* address/)).toHaveCount(0);
  await page.getByLabel('Amount').fill('25000');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: 'Continue to sign' }).click();
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByRole('button', { name: /Sign & broadcast/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment sent' })).toBeVisible();
  await expect(page.getByText('Balance 2,455,253 sats')).toBeVisible();
});

test('custom fees validate and wallet deletion requires typed confirmation', async ({ page }) => {
  await page.goto('/send');
  await page.getByLabel('Bitcoin address').fill('bcrt1qreceiver0000000000000000000000000000000');
  await page.getByLabel('Amount').fill('1000');
  await page.getByRole('button', { name: /Custom/ }).click();
  await page.getByLabel('Custom fee rate').fill('0');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeDisabled();
  await page.getByLabel('Custom fee rate').fill('3.5');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByLabel('Passphrase / PIN', { exact: true }).fill('prototype-passphrase');
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(page.getByRole('button', { name: 'Delete wallet' })).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Enter the passphrase / PIN for Family vault.')).toBeVisible();
});

test('locked regtest wallet reset requires exact typed confirmation', async ({ page }) => {
  await page.goto('/unlock');
  await page.getByRole('button', { name: 'Delete this regtest wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Delete this regtest wallet?' })).toBeVisible();
  const reset = page.getByRole('button', { name: 'Delete test wallet' });
  await expect(reset).toBeDisabled();
  await page.getByLabel('Type RESET REGTEST to confirm').fill('reset regtest');
  await expect(reset).toBeDisabled();
  await page.getByLabel('Type RESET REGTEST to confirm').fill('RESET REGTEST');
  await reset.click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Wallet to unlock')).toContainText('Family vault');
});

test('recovery words remain readable in light and dark themes', async ({ page }) => {
  for (const theme of ['Light', 'Dark']) {
    await page.goto('/settings');
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.goto('/welcome?fixture-empty=1');
    await page.getByRole('button', { name: 'Create new wallet' }).click();
    await page.getByRole('button', { name: 'Generate recovery words' }).click();
    await page.getByRole('button', { name: 'Reveal words' }).click();
    await expect(page.locator('.mnemonic-grid > div')).toHaveCount(24);
    const ratios = await page.evaluate(() => {
      const rgb = (value: string) => {
        if (value.startsWith('color(')) {
          return value.replace(/^color\([^ ]+\s+/, '').replace(/\).*$/, '').split(/\s+/).slice(0, 3).map(Number).map((channel) => channel * 255);
        }
        return (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      };
      const luminance = (value: number[]) => {
        const channels = value.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground: string, background: string) => {
        const [lighter, darker] = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => b - a);
        return (lighter + 0.05) / (darker + 0.05);
      };
      return [...document.querySelectorAll('.mnemonic-grid > div')].flatMap((cell) => {
        const background = getComputedStyle(cell).backgroundColor;
        return [
          contrast(getComputedStyle(cell.querySelector('strong')!).color, background),
          contrast(getComputedStyle(cell.querySelector('span')!).color, background)
        ];
      });
    });
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
  }
});

test('light and dark theme tokens keep readable text contrast', async ({ page }) => {
  await page.goto('/settings');
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const rgb = (name: string) => {
        const value = style.getPropertyValue(name).trim();
        const hex = value.slice(1);
        return [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((channel) => Number(`0x${channel}`));
      };
      const luminance = (value: number[]) => {
        const channels = value.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground: number[], background: number[]) => {
        const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (lighter + 0.05) / (darker + 0.05);
      };
      const background = rgb('--bg');
      return {
        text: contrast(rgb('--text'), background),
        muted: contrast(rgb('--muted'), background),
        mutedSecondary: contrast(rgb('--muted-2'), background)
      };
    });
    expect(ratios.text).toBeGreaterThanOrEqual(7);
    expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
    expect(ratios.mutedSecondary).toBeGreaterThanOrEqual(4.5);

    await page.goto('/unlock');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Passphrase / PIN' })).toBeVisible();
    const unlockRatios = await page.evaluate(() => {
      const rgb = (value: string) => {
        if (value.startsWith('color(')) {
          return value.replace(/^color\([^ ]+\s+/, '').replace(/\).*$/, '').split(/\s+/).slice(0, 3).map(Number).map((channel) => channel * 255);
        }
        return (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      };
      const luminance = (value: number[]) => {
        const channels = value.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground: string, background: string) => {
        const [lighter, darker] = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => b - a);
        return (lighter + 0.05) / (darker + 0.05);
      };
      const ratio = (foregroundSelector: string, backgroundSelector: string, pseudo?: string) => {
        const foreground = document.querySelector(foregroundSelector)!;
        let background = document.querySelector(backgroundSelector) as Element | null;
        let backgroundColor = 'rgb(0, 0, 0)';
        while (background) {
          const candidate = getComputedStyle(background).backgroundColor;
          if (candidate !== 'transparent' && !candidate.endsWith(', 0)') && !candidate.endsWith(', 0.0)')) {
            backgroundColor = candidate;
            break;
          }
          background = background.parentElement;
        }
        return contrast(getComputedStyle(foreground, pseudo).color, backgroundColor);
      };
      return {
        heading: ratio('.onboarding-card h1', '.onboarding-card'),
        copy: ratio('.onboarding-card > p', '.onboarding-card'),
        label: ratio('.onboarding-card .field > span', '.onboarding-card'),
        input: ratio('.onboarding-card input', '.onboarding-card input'),
        placeholder: ratio('.onboarding-card input', '.onboarding-card input', '::placeholder'),
        disabledAction: ratio('.onboarding-card .button', '.onboarding-card .button'),
        footer: ratio('.onboarding-footer', '.onboarding-overlay')
      };
    });
    for (const [surface, ratio] of Object.entries(unlockRatios)) {
      expect(ratio, `${theme} unlock ${surface} contrast`).toBeGreaterThanOrEqual(4.5);
    }
    await page.goto('/settings');
  }
});
