import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const unlockRoute = readFileSync(
  new URL('../../routes/unlock/+page.svelte', import.meta.url),
  'utf8'
);

describe('legacy profile compatibility UI', () => {
  it('discloses the unsupported disposable format without mutating it', () => {
    expect(unlockRoute).toContain('unsupported test-profile format');
    expect(unlockRoute).toContain('will not guess missing metadata or reset its app PIN');
    expect(unlockRoute).toContain('remain untouched until you explicitly delete it');
    expect(unlockRoute).not.toContain('Repair and unlock');
  });
});
