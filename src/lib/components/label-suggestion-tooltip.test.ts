import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tooltip = readFileSync(new URL('./Tooltip.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const labelRoutes = [
  '../../routes/send/+page.svelte',
  '../../routes/multisig/send/+page.svelte',
  '../../routes/receive/+page.svelte',
  '../../routes/multisig/receive/+page.svelte'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('label suggestion tooltips', () => {
  it('shows every suggestion full label instead of relying on overflow measurement', () => {
    for (const source of labelRoutes) {
      const suggestions = source.slice(source.indexOf('class="label-suggestions"'));
      expect(suggestions).toContain('text={suggestion.text}');
      expect(suggestions).not.toContain('truncatedSelector="button"');
    }
  });

  it('anchors above the hovered control and clamps the tooltip inside the viewport', () => {
    expect(tooltip).toContain('const rect = target.getBoundingClientRect()');
    expect(tooltip).toContain('document.body.append(node)');
    expect(tooltip).toContain('use:portal');
    expect(tooltip).toContain('rect.left + rect.width / 2');
    expect(tooltip).toContain('below = rect.top < 72');
    expect(appCss).toMatch(/\.ui-tooltip\s*\{[\s\S]*?translate\(-50%, -100%\)/);
    expect(appCss).toMatch(/\.ui-tooltip\.below\s*\{[\s\S]*?translateX\(-50%\)/);
  });
});
