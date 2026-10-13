import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const routesRoot = new URL('../../routes', import.meta.url).pathname;
const component = readFileSync(new URL('./WarningNotice.svelte', import.meta.url), 'utf8');

function svelteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? svelteFiles(path)
      : path.endsWith('.svelte')
        ? [path]
        : [];
  });
}

describe('shared warning notices', () => {
  it('keeps warning surfaces out of route-local markup', () => {
    for (const path of svelteFiles(routesRoot)) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/class=["'][^"']*warning-box/);
    }
  });

  it('owns the shared tone, hierarchy, insight, spacing, and semantics', () => {
    expect(component).toContain("tone?: 'warning' | 'danger'");
    expect(component).toContain('insightText?: string');
    expect(component).toContain('credentialSpacing?: boolean');
    expect(component).toContain("element?: 'aside' | 'div'");
    expect(component).toContain('<InsightTip');
  });
});
