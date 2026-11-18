import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';

const componentsRoot = fileURLToPath(new URL('./', import.meta.url));
const routesRoot = fileURLToPath(new URL('../../routes', import.meta.url));
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

  it('routes all active errors through the shared notice, including field and loading failures', () => {
    for (const path of [...svelteFiles(routesRoot), ...svelteFiles(componentsRoot)]) {
      const source = readFileSync(path, 'utf8');
      function visit(value: unknown) {
        if (!value || typeof value !== 'object') return;
        const node = value as Record<string, unknown>;
        if (node.type === 'RegularElement') {
          const attributes = Object.fromEntries(
            (node.attributes as Array<Record<string, unknown>>)
              .filter(
                (attribute) => attribute.type === 'Attribute' && Array.isArray(attribute.value)
              )
              .map((attribute) => [
                attribute.name,
                (attribute.value as Array<{ data?: string }>)
                  .map((part) => part.data ?? '')
                  .join('')
              ])
          );
          expect(attributes.role, `${path}: raw <${node.name}> alert`).not.toBe('alert');
          expect(attributes.class ?? '', `${path}: obsolete inline error`).not.toMatch(
            /(?:^|\s)(?:form-error|inline-error|import-error|policy-errors|scan-error-card)(?:\s|$)/
          );
        }
        for (const child of Object.values(node)) {
          if (Array.isArray(child)) child.forEach(visit);
          else if (child && typeof child === 'object') visit(child);
        }
      }
      visit(parse(source, { modern: true }));
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
