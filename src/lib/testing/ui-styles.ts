import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));

function stylesheet(path: string): string {
  return readFileSync(path, 'utf8').replace(/@import\s+'([^']+)';/g, (_, relative: string) =>
    stylesheet(join(dirname(path), relative))
  );
}

function componentStyles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return componentStyles(path);
    if (!entry.name.endsWith('.svelte')) return [];
    return [...readFileSync(path, 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(
      (match) => match[1]
    );
  });
}

// Source-contract checks inspect declarations across owners. Browser comparisons
// separately verify the compiled scope, specificity, order and actual rendering.
function unwrapScope(source: string): string {
  let result = source.replace(/:global\(([^\n]*?)\):where\(\.[\w-]+\)/g, '$1');
  while (result.includes(':global(')) {
    const start = result.indexOf(':global(');
    let depth = 1;
    let end = start + 8;
    for (; end < result.length; end++) {
      if (result[end] === '(') depth++;
      if (result[end] === ')' && --depth === 0) break;
    }
    result = result.slice(0, start) + result.slice(start + 8, end) + result.slice(end + 1);
  }
  return result.replace(
    /([^{}]+)\{/g,
    (_, prelude: string) =>
      `${prelude.match(/^\s*/)?.[0] ?? ''}${prelude.trim().replace(/\s+/g, ' ')} {`
  );
}

export function readUiStyles(): string {
  return [stylesheet(join(sourceRoot, 'app.css')), ...componentStyles(sourceRoot)]
    .map(unwrapScope)
    .join('\n');
}
