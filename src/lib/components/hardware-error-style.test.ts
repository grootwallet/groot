import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

function declaration(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return appCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('hardware signer error styling', () => {
  it('uses one semantic danger color for the title and explanation', () => {
    expect(declaration('.hardware-inline-error strong')).toContain('color: var(--danger)');
    expect(declaration('.hardware-inline-error small')).toContain('color: var(--danger)');
  });
});
