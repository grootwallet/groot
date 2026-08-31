import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./PermanentLabelEditor.svelte', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../wallet/label-suggestions.ts', import.meta.url), 'utf8');
const labelRoutes = [
  '../../routes/send/+page.svelte',
  '../../routes/multisig/send/+page.svelte',
  '../../routes/receive/+page.svelte',
  '../../routes/multisig/receive/+page.svelte'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('label token keyboard focus', () => {
  it('keeps focus in every label input when plain Tab commits a non-empty draft', () => {
    expect(controller).toContain("if (key === 'Tab' && shiftKey)");
    expect(controller).toContain("!['Enter', 'Tab', ',', ';'].includes(key)");
    expect(editor).toContain('if (result.preventDefault) event.preventDefault();');
    expect(editor).not.toContain("if (event.key !== 'Tab') event.preventDefault();");
  });

  it('routes all four permanent-label flows through the shared editor', () => {
    for (const source of labelRoutes) {
      expect(source).toContain(
        "import PermanentLabelEditor from '$lib/components/PermanentLabelEditor.svelte'"
      );
      expect(source).toContain('<PermanentLabelEditor');
      expect(source).not.toContain('function handleLabelKeydown');
    }
  });
});
