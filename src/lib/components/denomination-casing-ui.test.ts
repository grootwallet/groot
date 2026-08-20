import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const amountComponent = readFileSync(new URL('./Amount.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

function svelteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return svelteFiles(path);
    return entry.isFile() && entry.name.endsWith('.svelte') ? [path] : [];
  });
}

describe('denomination casing', () => {
  it('never hard-codes a capitalized sats unit in a user-facing Svelte surface', () => {
    for (const file of svelteFiles(sourceRoot)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\b(?:SATS|Sats)\b/);
    }
  });

  it('uses the canonical unit formatter and protects its casing from inherited CSS', () => {
    expect(amountComponent).toContain('amountUnit($denomination)');
    expect(appCss).toMatch(/\.formatted-amount small\s*\{[^}]*text-transform:\s*none;/s);
    expect(appCss).toContain('.tx-amount > small');
    expect(appCss).not.toContain('.tx-amount small');
  });
});
