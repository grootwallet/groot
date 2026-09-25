import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRoute = (path: string) =>
  readFileSync(new URL(`../../routes/${path}/+page.svelte`, import.meta.url), 'utf8');

const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const activity = readRoute('activity');
const coins = readRoute('coins');
const receive = readRoute('receive');
const multisigReceive = readRoute('multisig/receive');
const settings = readRoute('settings');
const send = readRoute('send');
const multisigSend = readRoute('multisig/send');
const feeSelector = readFileSync(new URL('./FeeSelector.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('shared page presentation', () => {
  it('keeps primary wallet pages to one title without route eyebrows or subtitles', () => {
    for (const source of [overview, activity, coins, receive, multisigReceive, settings]) {
      expect(source).not.toContain('class="eyebrow"');
      expect(source).not.toContain('class="subtitle"');
    }
    expect(settings).toContain("translate($locale, '{walletName} settings'");
  });

  it('lets both Coins summary amounts switch the global denomination', () => {
    expect(coins.match(/<Amount[\s\S]*?interactive/g)).toHaveLength(2);
  });

  it('removes the immutable-label counter from ordinary send intent forms', () => {
    expect(send).toContain('showCounter={false}');
    expect(multisigSend).toContain('showCounter={false}');
  });

  it('keeps fee attribution out of the compact estimated-fee line', () => {
    const feeLine = feeSelector.slice(feeSelector.indexOf('class="fee-source"'));
    expect(feeLine).not.toContain('estimates.source');
  });

  it('uses light blue rather than success green for completed progress steps', () => {
    expect(appCss).toContain('--step-complete-bg: #dbe8ff;');
    expect(appCss).toMatch(
      /\.send-progress li\.complete > span\s*\{[\s\S]*?background: var\(--step-complete-bg\);/
    );
    expect(appCss).toMatch(
      /\.setup-progress li\.complete \.setup-progress-number\s*\{[\s\S]*?background: var\(--step-complete-bg\);/
    );
  });
});
