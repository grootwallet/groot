import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const walletProfiles = readFileSync(new URL('./WalletProfileList.svelte', import.meta.url), 'utf8');
const backup = readFileSync(
  new URL('../../routes/multisig/backup/+page.svelte', import.meta.url),
  'utf8'
);

describe('application-wide UI readability', () => {
  it('uses the readable supporting tier across high-frequency wallet surfaces', () => {
    expect(css).toContain('--font-size-meta: 13px');
    expect(css).toMatch(/\.wallet-profile-copy strong\s*\{[^}]*font-size: 14px/s);
    expect(css).toMatch(/\.tx-main strong,[\s\S]*?font-size: 15px/s);
    expect(css).toMatch(/\.coin-main strong\s*\{[^}]*font-size: 15px/s);
    expect(css).toMatch(
      /\.permanent-label-tag,[\s\S]*?font-size: var\(--font-size-meta\) !important/s
    );
    expect(css).toMatch(/\.coin-status\s*\{[^}]*font-size: var\(--font-size-meta\) !important/s);
    expect(css).toMatch(
      /\.formatted-amount small\s*\{[^}]*max\(0\.72em, var\(--font-size-meta\)\)/s
    );
  });

  it('keeps the selected desktop wallet visible in the compact list', () => {
    expect(walletProfiles).toContain('bind:this={list}');
    expect(walletProfiles).toContain('querySelector<HTMLElement>(\'[aria-current="true"]\')');
    expect(walletProfiles).toContain("scrollIntoView({ block: 'nearest' })");
  });

  it('uses the standard blue disclosure for optional multi-sentence guidance', () => {
    expect(backup).toContain('class="optional-insight-disclosure"');
    expect(backup).toContain("'About backup formats'");
    expect(css).toMatch(/\.optional-insight-disclosure > summary\s*\{[^}]*color: var\(--link\)/s);
    expect(css).toMatch(
      /\.optional-insight-disclosure\[open\] > summary svg\s*\{[^}]*rotate\(90deg\)/s
    );
  });
});
