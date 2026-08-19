import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('market-data privacy boundary', () => {
  it('keeps removed market surfaces and native provider commands out of the runtime', () => {
    expect(existsSync(resolve(root, 'src/routes/market/+page.svelte'))).toBe(false);
    expect(existsSync(resolve(root, 'src-tauri/src/market_data.rs'))).toBe(false);

    const runtimeSources = [
      source('src-tauri/src/lib.rs'),
      source('src/lib/components/AppShell.svelte'),
      source('src/routes/+page.svelte'),
      source('src/routes/settings/+page.svelte')
    ].join('\n');

    expect(runtimeSources).not.toMatch(/market_(ticker|history|stats)/);
    expect(runtimeSources).not.toContain('sats-signal');
    expect(runtimeSources).not.toContain('/market');
    expect(runtimeSources).not.toContain('$lib/market');
  });
});
