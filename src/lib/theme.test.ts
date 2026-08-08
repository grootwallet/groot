import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

function declarations(source: string): Record<string, string> {
  return Object.fromEntries([...source.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

function themeTokens(theme: 'dark' | 'light'): Record<string, string> {
  const root = css.match(/^:root \{([\s\S]*?)^\}/m)?.[1] ?? '';
  const light = css.match(/^:root\[data-theme='light'\] \{([^}]*)\}/m)?.[1] ?? '';
  return theme === 'light' ? { ...declarations(root), ...declarations(light) } : declarations(root);
}

function resolveToken(name: string, tokens: Record<string, string>): string {
  const value = tokens[name];
  const reference = value?.match(/^var\(--([\w-]+)\)$/)?.[1];
  return reference ? resolveToken(reference, tokens) : value;
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const expanded = value.length === 3 ? [...value].map((character) => character.repeat(2)).join('') : value;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme system', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`${theme} semantic text and control pairs meet contrast requirements`, () => {
      const tokens = themeTokens(theme);
      const pairs: Array<[string, string, number]> = [
        ['text', 'bg', 7],
        ['muted', 'bg', 4.5],
        ['muted-2', 'bg', 4.5],
        ['text', 'panel', 7],
        ['muted', 'panel', 4.5],
        ['text', 'surface-control', 7],
        ['muted', 'surface-control', 4.5],
        ['muted-2', 'surface-control', 4.5],
        ['text-soft', 'surface-inset', 4.5],
        ['primary-fg', 'primary-bg', 4.5],
        ['danger-fg', 'danger', 4.5],
        ['warning-text', 'panel', 4.5],
        ['link', 'bg', 4.5]
      ];
      for (const [foreground, background, minimum] of pairs) {
        expect(contrast(resolveToken(foreground, tokens), resolveToken(background, tokens)), `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
      }
    });
  }

  it('keeps component surfaces semantic and recovery words explicitly readable', () => {
    expect(css).toMatch(/\.mnemonic-grid > div \{[^}]*color: var\(--text\);[^}]*background: var\(--surface-control\);/);
    expect(css).toContain('.mnemonic-grid strong { color: var(--text);');
    const componentRules = css.slice(css.indexOf('* {'));
    for (const legacyDarkSurface of ['#121214', '#151517', '#141416', '#101012']) {
      expect(componentRules, legacyDarkSurface).not.toContain(`background: ${legacyDarkSurface}`);
    }
  });

  it('defines every design token referenced by the global stylesheet', () => {
    const defined = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]));
    const referenced = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map((match) => match[1]));
    expect([...referenced].filter((token) => !defined.has(token))).toEqual([]);
  });

  it('applies the saved theme before paint without weakening the Tauri CSP', () => {
    expect(appHtml).toContain('<script src="/theme-init.js"></script>');
    expect(appHtml).not.toMatch(/<script>([\s\S]*?)<\/script>/);
  });
});
