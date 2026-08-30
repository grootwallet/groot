import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every credential-bearing route must clear its credential field after an
// attempt and on component teardown. These are source-level contracts, paired
// with the native behavior: a credential must never linger in renderer state
// after success, failure, or unmount.
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const unlock = readFileSync(new URL('../../routes/unlock/+page.svelte', import.meta.url), 'utf8');

describe('credential teardown discipline', () => {
  it('overview clears the backup-verification credential on success, failure, and unmount', () => {
    expect(overview).toContain("import { onDestroy, onMount } from 'svelte';");
    const successClears = overview.match(/verifyBackup[\s\S]*?verifyCredential = '';/);
    expect(successClears).not.toBeNull();
    expect(overview).toContain('finally');
    expect(overview).toContain("onDestroy(() => {\n    verifyCredential = '';\n  });");
  });

  it('unlock clears its credential fields on component teardown', () => {
    expect(unlock).toContain('onDestroy(');
    expect(unlock).toMatch(/onDestroy\(\(\) => \{\s*credential = '';/);
  });
});
