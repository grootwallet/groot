import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

describe('approved wallet design foundations', () => {
  it('bundles one exact licensed font without a remote service or blocking font display', () => {
    const font = readFileSync(
      new URL('../../static/fonts/source-sans-3.052R.woff2', import.meta.url)
    );
    expect(font.length).toBe(170188);
    expect(createHash('sha256').update(font).digest('hex')).toBe(
      '5f16566f7a40d39b339ad26be151fa5a1ab1f0c2574c7a2e619765584a1acbd8'
    );
    const license = readFileSync(
      new URL('../../static/fonts/source-sans-OFL.md', import.meta.url),
      'utf8'
    );
    expect(license).toContain('Copyright 2010-2022 Adobe');
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
    const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)];
    expect(faces).toHaveLength(1);
    expect(faces[0][1]).toContain("url('/fonts/source-sans-3.052R.woff2')");
    expect(faces[0][1]).toContain('font-display: swap');
    expect(css).not.toMatch(/(?:url\(|@import\s+)[^;\n]*https?:/);
  });

  it('shares typography and geometry without changing backup print typography', () => {
    expect(css).toContain('font-family: var(--font-ui)');
    expect(css).toContain('--font-size-meta: 11px');
    expect(css).toContain('--radius-panel: 20px');
    expect(css).toContain('--radius-control: 10px');
    expect(css).not.toContain("'DM Mono'");
    expect(css.slice(css.indexOf('@media print'))).toContain('600 26px/1.1 Georgia');
  });

  it('keeps financial surfaces opaque and focus inside clipped transaction lists', () => {
    expect(css).toMatch(/\.balance-card\s*\{[^}]*background: var\(--panel\)/);
    expect(css).not.toContain('.balance-card::after');
    expect(css).toMatch(/\.tx-row:focus-visible,[\s\S]*?outline-offset: -3px/);
    expect(css.match(/\.mobile-nav \{[^}]*backdrop-filter/g)).toBeNull();
    expect(css).toMatch(/\.build-identity-onboarding\s*\{[^}]*position: relative/);
    expect(css).toMatch(
      /\.app-shell:has\(\.onboarding-overlay\) > \.build-identity-onboarding\s*\{[^}]*position: fixed/
    );
  });
});
