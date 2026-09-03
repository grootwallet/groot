#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSourceComments } from './source-lexing.mjs';

const root = new URL('../../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const fail = (message) => {
  console.error(`Secret-surface gate failed: ${message}`);
  process.exit(1);
};

function sourceFiles(directory) {
  const absolute = fileURLToPath(new URL(`${directory}/`, root));
  const visit = (path) =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) return visit(child);
      return ['.rs', '.ts', '.svelte'].includes(extname(entry.name)) ? [child] : [];
    });
  return visit(absolute).map((path) => ({
    path: relative(rootPath, path),
    content: readFileSync(path, 'utf8')
  }));
}

const productionSources = [...sourceFiles('src'), ...sourceFiles('src-tauri/src')].filter(
  ({ path }) =>
    !/\.(?:test|spec)\.(?:ts|js)$/.test(path) &&
    !/(?:^|\/)(?:tests|performance_tests|funded_acceleration_tests)\.rs$/.test(path)
);

export function hasUnreviewedLogging(content) {
  return /(?:\bconsole\s*(?:(?:\?\.|\.)\s*(?:log|debug|info|warn|error|trace|dir|table|group|groupCollapsed)|(?:\?\.)?\s*\[\s*['"](?:log|debug|info|warn|error|trace|dir|table|group|groupCollapsed)['"]\s*\])\s*\(|\b(?:println|eprintln|print|eprint|dbg)!\s*\(|\b(?:tracing|log)\s*::|\b(?:std\s*::\s*)?io\s*::\s*(?:stdout|stderr)\s*\()/.test(
    content
  );
}

export function stripRustTestModules(content) {
  const masked = stripSourceComments(content, { rust: true, maskStrings: true });
  const ranges = [];
  for (const match of masked.matchAll(
    /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*mod\s+[A-Za-z0-9_]+\s*\{/g
  )) {
    const start = match.index;
    const bodyStart = start + match[0].lastIndexOf('{');
    let depth = 0;
    for (let index = bodyStart; index < masked.length; index += 1) {
      if (masked[index] === '{') depth += 1;
      if (masked[index] === '}' && --depth === 0) {
        ranges.push([start, index + 1]);
        break;
      }
    }
  }
  for (const [start, end] of ranges.reverse()) {
    content = `${content.slice(0, start)}${' '.repeat(end - start)}${content.slice(end)}`;
  }
  return content;
}

const logged = productionSources.find(({ path, content }) =>
  hasUnreviewedLogging(path.endsWith('.rs') ? stripRustTestModules(content) : content)
);
if (logged) fail(`unreviewed production logging exists in ${logged.path}`);

export function sensitiveStringIsWrappedBeforeFallibleWork(content) {
  content = stripSourceComments(content, { rust: true, maskStrings: true });
  const normalizeType = (value) => value.replace(/\s+/g, '');
  const stringTypes = new Set([
    'String',
    'std::string::String',
    '::std::string::String',
    'alloc::string::String',
    '::alloc::string::String'
  ]);
  for (const imported of content.matchAll(
    /\buse\s+(?:::)?\s*(?:std|alloc)\s*::\s*string\s*::\s*String\s+as\s+([A-Za-z0-9_]+)\s*;/g
  )) {
    stringTypes.add(imported[1]);
  }
  let discoveredAlias = true;
  while (discoveredAlias) {
    discoveredAlias = false;
    for (const alias of content.matchAll(
      /\btype\s+([A-Za-z0-9_]+)\s*=\s*((?:::)?\s*[A-Za-z0-9_]+(?:\s*::\s*[A-Za-z0-9_]+)*)\s*;/g
    )) {
      if (stringTypes.has(normalizeType(alias[2])) && !stringTypes.has(alias[1])) {
        stringTypes.add(alias[1]);
        discoveredAlias = true;
      }
    }
  }
  const zeroizingImports = [...content.matchAll(/\buse\b[^;]*\bZeroizing\b[^;]*;/g)].map((match) =>
    match[0].replace(/\s+/g, '')
  );
  if (
    /\b(?:struct|enum|union|type|mod)\s+Zeroizing\b|\buse\b[^;]*\bas\s+Zeroizing\b/.test(content) ||
    zeroizingImports.some(
      (statement) =>
        !statement.startsWith('usezeroize::') && !statement.startsWith('use::zeroize::')
    )
  ) {
    return false;
  }
  const hasZeroizingProvenance =
    zeroizingImports.length > 0 || /\buse\s+super\s*::\s*\*\s*;/.test(content);
  const functionStart =
    /\bpub(?:\([^)]*\))?\s+(?:(?:async|unsafe|const|extern)\s+)*fn\s+[A-Za-z0-9_]+(?:\s*<[^>{}]*>)?\s*\(/g;
  for (const match of content.matchAll(functionStart)) {
    const parametersStart = match.index + match[0].lastIndexOf('(');
    let depth = 0;
    let parametersEnd = -1;
    for (let index = parametersStart; index < content.length; index += 1) {
      if (content[index] === '(') depth += 1;
      if (content[index] === ')' && --depth === 0) {
        parametersEnd = index;
        break;
      }
    }
    if (parametersEnd < 0) return false;
    const bodyStart = content.indexOf('{', parametersEnd);
    if (bodyStart < 0) return false;
    const parameters = content.slice(parametersStart + 1, parametersEnd);
    const sensitive = [
      ...parameters.matchAll(
        /\b([A-Za-z0-9_]+)\s*:\s*((?:::)?\s*[A-Za-z0-9_]+(?:\s*::\s*[A-Za-z0-9_]+)*)\b/g
      )
    ]
      .filter(
        ([, name, type]) =>
          /(?:credential|password|passphrase|(?:^|_)pin(?:_|$)|secret)/i.test(name) &&
          stringTypes.has(normalizeType(type))
      )
      .map((value) => value[1]);
    if (sensitive.length > 0) {
      if (!hasZeroizingProvenance) return false;
      const statements = content
        .slice(bodyStart + 1, bodyStart + 2_000)
        .split(';', sensitive.length)
        .map((statement) => statement.trim());
      if (statements.length !== sensitive.length) return false;
      const wrapped = new Set();
      for (const statement of statements) {
        const match = statement.match(
          /^let\s+([A-Za-z0-9_]+)\s*=\s*Zeroizing\s*::\s*new\s*\(\s*([A-Za-z0-9_]+)\s*\)$/
        );
        if (!match || match[1] !== match[2] || !sensitive.includes(match[1])) return false;
        wrapped.add(match[1]);
      }
      if (wrapped.size !== sensitive.length) return false;
    }
  }
  return true;
}

for (const source of productionSources.filter(({ path }) => path.endsWith('.rs'))) {
  if (!sensitiveStringIsWrappedBeforeFallibleWork(source.content)) {
    fail(`credential/password String is not protected before fallible work in ${source.path}`);
  }
}

const clipboardReaders = productionSources.find(({ content }) =>
  /clipboard(?:_manager)?(?::|\.)?(?:read|readText)|allow-read-text/.test(content)
);
if (clipboardReaders) fail(`clipboard reads are forbidden (${clipboardReaders.path})`);

const clipboardImports = productionSources
  .filter(({ content }) => content.includes('@tauri-apps/plugin-clipboard-manager'))
  .map(({ path }) => path);
if (clipboardImports.length !== 1 || clipboardImports[0] !== 'src/lib/clipboard.ts') {
  fail('the Tauri clipboard plugin must be imported only by src/lib/clipboard.ts');
}
const browserClipboardUsers = productionSources
  .filter(({ content }) => content.includes('navigator.clipboard'))
  .map(({ path }) => path);
if (browserClipboardUsers.length !== 1 || browserClipboardUsers[0] !== 'src/lib/clipboard.ts') {
  fail('browser clipboard writes must be classified by src/lib/clipboard.ts');
}

// Tauri recursively loads multiple capability formats. Groot intentionally
// permits one reviewed root capability only: any second file, nested entry,
// directory, symlink, or alternate format must fail closed instead of relying
// on this gate to reproduce Tauri's parser and glob semantics.
const capabilitiesDir = fileURLToPath(new URL('src-tauri/capabilities/', root));
export function approvedCapabilityPermissions(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    entries[0].name !== 'default.json' ||
    !entries[0].isFile() ||
    entries[0].isSymbolicLink()
  ) {
    throw new Error(
      'src-tauri/capabilities must contain only the reviewed regular file default.json'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(directory, 'default.json'), 'utf8'));
  } catch {
    throw new Error('capability default.json is not valid JSON');
  }
  if (!Array.isArray(parsed.permissions)) {
    throw new Error('capability default.json has no permissions array');
  }
  return new Set(parsed.permissions);
}

let mergedPermissions;
try {
  mergedPermissions = approvedCapabilityPermissions(capabilitiesDir);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const expectedPermissions = ['core:default', 'clipboard-manager:allow-write-text'];
if (
  mergedPermissions.size !== expectedPermissions.length ||
  !expectedPermissions.every((permission) => mergedPermissions.has(permission))
) {
  fail(
    `merged capabilities [${[...mergedPermissions].sort().join(', ')}] must equal [${expectedPermissions.join(', ')}]`
  );
}

export function validateCsp(csp) {
  const entries = csp
    .split(';')
    .map((directive) => directive.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0)
    .map(([name, ...sources]) => [name.toLowerCase(), sources]);
  const names = new Set();
  for (const [name] of entries) {
    if (names.has(name)) throw new Error(`CSP directive ${name} must appear exactly once`);
    names.add(name);
  }
  const directives = new Map(entries);
  const required = new Map([
    ['default-src', ["'self'"]],
    ['connect-src', ['ipc:', 'http://ipc.localhost']],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['font-src', ["'self'"]],
    ['script-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['worker-src', ["'self'", 'blob:']],
    ['media-src', ["'self'", 'blob:']],
    ['manifest-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'self'"]]
  ]);
  if (directives.size !== required.size) {
    throw new Error('CSP must contain exactly the reviewed directives');
  }
  for (const [name, expected] of required) {
    const actual = directives.get(name) ?? [];
    if (actual.length !== expected.length || !expected.every((source) => actual.includes(source))) {
      throw new Error(`CSP directive ${name} must equal ${expected.join(' ')}`);
    }
  }
}

const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'));
try {
  validateCsp(tauriConfig?.app?.security?.csp ?? '');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const packageJson = JSON.parse(read('package.json'));
const dependencyEntries = Object.entries({
  ...packageJson.dependencies,
  ...packageJson.devDependencies
});
const telemetryPattern =
  /(?:analytics|telemetry|sentry|datadog|segment|mixpanel|posthog|crashlytics|opentelemetry|amplitude|bugsnag|rollbar|new[.-]?relic|honeycomb|firebase)/i;

export function unreviewedTelemetryDependency(entries) {
  for (const entry of entries) {
    const [name, specification = ''] = Array.isArray(entry) ? entry : [entry, ''];
    if (telemetryPattern.test(name) || telemetryPattern.test(specification)) return name;
  }
  return undefined;
}

export function hasUnreviewedRustTelemetryDependency(manifest) {
  const dependency = '(?:tracing|log|sentry|opentelemetry|honeycomb|firebase)';
  return (
    new RegExp(`^\\s*(?:["']?${dependency}["']?)\\s*=`, 'im').test(manifest) ||
    new RegExp(`\\bpackage\\s*=\\s*["']${dependency}["']`, 'i').test(manifest) ||
    new RegExp(`^\\s*\\[[^\\]\\r\\n]*dependencies\\.(?:["']?${dependency}["']?)\\s*\\]`, 'im').test(
      manifest
    )
  );
}

const telemetryDependency = unreviewedTelemetryDependency(dependencyEntries);
if (telemetryDependency) fail(`telemetry/crash dependency is not reviewed: ${telemetryDependency}`);

const cargoManifest = read('src-tauri/Cargo.toml');
if (hasUnreviewedRustTelemetryDependency(cargoManifest)) {
  fail('a Rust logging/telemetry dependency was added without review');
}

const tauriAdapter = read('src/lib/wallet/tauri.ts');
if (!tauriAdapter.includes("command<boolean>('wallet_generate_mnemonic'")) {
  fail('generated mnemonic presentation must return only native verification state');
}
if (/command<[^>]*(?:Mnemonic|string)[^>]*>\('wallet_generate_mnemonic'/.test(tauriAdapter)) {
  fail('generated mnemonic material must never be returned through IPC');
}
if (!tauriAdapter.includes("command<boolean>('wallet_reveal_and_verify_backup'")) {
  fail('recovery-word re-presentation must return only native verification state');
}
if (
  /command<[^>]*(?:Mnemonic|string)[^>]*>\('wallet_reveal_and_verify_backup'/.test(tauriAdapter)
) {
  fail('recovery words must never be returned through re-presentation IPC');
}

console.log('Secret surfaces: write-only, bounded, and free of logging/telemetry sinks.');
