import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));

function svelteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return svelteFiles(path);
    return entry.isFile() && entry.name.endsWith('.svelte') ? [path] : [];
  });
}

describe('bounded text-field counters', () => {
  it('shows the shared counter on every 48-character name and label field', () => {
    let boundedFields = 0;

    for (const file of svelteFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<label class="field">[\s\S]*?<\/label>/g)) {
        if (!match[0].includes('maxlength="48"')) continue;
        boundedFields += 1;
        expect(match[0], file).toContain('<FieldCounter');
        expect(match[0], file).toContain('max={48}');
      }
    }

    expect(boundedFields).toBeGreaterThan(0);
  });
});
