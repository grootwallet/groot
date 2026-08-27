import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('automatic lock menu', () => {
  it('uses Groot controls instead of the platform-native select popup', () => {
    expect(settings).not.toContain('<select\n          class="timeout-choice"');
    expect(settings).toContain('class="timeout-choice"');
    expect(settings).toContain('aria-haspopup="menu"');
    expect(settings).toContain('class="timeout-menu"');
    expect(settings).toContain('role="menuitemradio"');
    expect(settings).toContain('aria-checked={inactivityTimeoutMinutes === option.value}');
  });

  it('supports keyboard navigation and application typography', () => {
    expect(settings).toContain("['ArrowDown', 'ArrowUp', 'Home', 'End']");
    expect(settings).toContain("event.key === 'Escape'");
    expect(appCss).toMatch(/\.timeout-menu button\s*\{[\s\S]*?font: inherit;/);
    expect(appCss).toMatch(/\.timeout-menu button:focus-visible\s*\{/);
  });
});
