import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tooltip = readFileSync(new URL('./Tooltip.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const labelEditor = readFileSync(new URL('./PermanentLabelEditor.svelte', import.meta.url), 'utf8');

describe('label suggestion tooltips', () => {
  it('measures a dedicated ellipsis span before showing a suggestion tooltip', () => {
    const suggestions = labelEditor.slice(labelEditor.indexOf('class="label-suggestions"'));
    expect(suggestions).toContain('text={suggestion.text}');
    expect(suggestions).toContain('truncatedSelector=".label-suggestion-text"');
    expect(suggestions).toContain('positionSelector="button"');
    expect(suggestions).toContain('class="label-suggestion-text"');
    expect(appCss).toMatch(
      /\.label-suggestion-text\s*\{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/
    );
  });

  it('anchors above the hovered control and clamps the tooltip inside the viewport', () => {
    expect(tooltip).toContain('root.querySelector<HTMLElement>(positionSelector)');
    expect(tooltip).toContain('const rect = positionTarget.getBoundingClientRect()');
    expect(tooltip).toContain('document.body.append(node)');
    expect(tooltip).toContain('use:portal');
    expect(tooltip).toContain('rect.left + rect.width / 2');
    expect(tooltip).toContain('below = rect.top < 72');
    expect(appCss).toMatch(/\.ui-tooltip\s*\{[\s\S]*?translate\(-50%, -100%\)/);
    expect(appCss).toMatch(/\.ui-tooltip\.below\s*\{[\s\S]*?translateX\(-50%\)/);
  });

  it('uses the shared compact borderless tooltip surface', () => {
    expect(appCss).toMatch(/\.ui-tooltip\s*\{[\s\S]*?border: 0;[\s\S]*?border-radius: 4px;/);
  });

  it('uses the same quiet blue treatment for saved suggestions and permanent labels', () => {
    expect(appCss).toMatch(
      /\.label-suggestions button\s*\{[\s\S]*?background: color-mix\(in srgb, var\(--fr-blue\) 8%/
    );
    expect(appCss).toMatch(
      /\.permanent-label-tag,[\s\S]*?background: color-mix\(in srgb, var\(--fr-blue\) 8%/
    );
  });
});
