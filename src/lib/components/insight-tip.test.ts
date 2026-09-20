import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./InsightTip.svelte', import.meta.url), 'utf8');

describe('InsightTip', () => {
  it('portals reusable tooltip content outside clipping dialogs', () => {
    expect(component).toContain('document.body.append(node)');
    expect(component).toContain('use:portal');
    expect(component).toContain('style:left=');
    expect(component).toContain('style:top=');
    expect(component).toContain("event.key === 'Escape'");
  });

  it('supports click dismissal and viewport-aware placement', () => {
    expect(component).toContain('function toggleTooltip()');
    expect(component).toContain('trigger?.blur()');
    expect(component).toContain('window.innerWidth - 138');
    expect(component).toContain('rect.top < 90');
  });
});
