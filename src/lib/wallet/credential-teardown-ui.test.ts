import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every credential-bearing route must clear its credential field after an
// attempt and on component teardown. These are source-level contracts, paired
// with the native behavior: a credential must never linger in renderer state
// after success, failure, or unmount.
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const unlock = readFileSync(new URL('../../routes/unlock/+page.svelte', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);

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

  it('settings clears credential-bearing modals on every shared dismissal path', () => {
    expect(settings).toMatch(
      /function closeDeleteWallet\(\)[\s\S]*?deleteCredential = '';[\s\S]*?confirmText = '';[\s\S]*?deleting = false;/
    );
    expect(settings).toMatch(
      /function closeFullRescan\(\)[\s\S]*?scanCredential = '';[\s\S]*?scanOpen = false;/
    );
    expect(settings).toMatch(
      /function closeNodeSettings\(\)[\s\S]*?clearNodeCredentials\(\);[\s\S]*?nodeOpen = false;/
    );
    expect(settings).toContain('onclose={closeDeleteWallet}');
    expect(settings).toContain('onclick={closeDeleteWallet}');
    expect(settings).toContain('onclose={closeFullRescan}');
    expect(settings).toContain('onclick={closeFullRescan}');
    expect(settings).toContain('onclose={closeNodeSettings}');
    expect(settings).toContain('onclick={closeNodeSettings}');
  });
});
