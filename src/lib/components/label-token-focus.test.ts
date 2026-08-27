import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const labelRoutes = [
  '../../routes/send/+page.svelte',
  '../../routes/multisig/send/+page.svelte',
  '../../routes/receive/+page.svelte',
  '../../routes/multisig/receive/+page.svelte'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('label token keyboard focus', () => {
  it('keeps focus in every label input when plain Tab commits a non-empty draft', () => {
    for (const source of labelRoutes) {
      expect(source).toContain("if (event.key === 'Tab' && event.shiftKey) return;");
      expect(source).toMatch(
        /if \(!label\.trim\(\) \|\| !\['Enter', 'Tab', ',', ';'\]\.includes\(event\.key\)\) return;\s+event\.preventDefault\(\);/
      );
      expect(source).not.toContain("if (event.key !== 'Tab') event.preventDefault();");
    }
  });
});
