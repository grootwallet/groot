#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const fail = (message) => {
  console.error(`Secret-surface gate failed: ${message}`);
  process.exit(1);
};

function sourceFiles(directory) {
  const absolute = fileURLToPath(new URL(`${directory}/`, root));
  const visit = (path) => readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return visit(child);
    return ['.rs', '.ts', '.svelte'].includes(extname(entry.name)) ? [child] : [];
  });
  return visit(absolute).map((path) => ({
    path: relative(rootPath, path),
    content: readFileSync(path, 'utf8')
  }));
}

const productionSources = [...sourceFiles('src'), ...sourceFiles('src-tauri/src')]
  .filter(({ path }) => !/\.(?:test|spec)\.(?:ts|js)$/.test(path));

const loggingPattern = /\b(?:console\.(?:log|debug|info|warn|error)|(?:println|eprintln|dbg)!|tracing::|log::)/;
const logged = productionSources.find(({ content }) => loggingPattern.test(content));
if (logged) fail(`unreviewed production logging exists in ${logged.path}`);

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

const capability = JSON.parse(read('src-tauri/capabilities/default.json'));
const expectedPermissions = ['core:default', 'clipboard-manager:allow-write-text'];
if (JSON.stringify(capability.permissions) !== JSON.stringify(expectedPermissions)) {
  fail('desktop capabilities must remain core defaults plus clipboard write-only');
}

const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'));
const csp = tauriConfig?.app?.security?.csp ?? '';
for (const required of ["default-src 'self'", 'connect-src ipc: http://ipc.localhost', "object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'", "form-action 'self'"]) {
  if (!csp.includes(required)) fail(`CSP is missing ${required}`);
}
if (csp.includes("'unsafe-eval'") || csp.replace('http://ipc.localhost', '').includes('://')) {
  fail('CSP permits eval or a remote HTTP origin');
}

const packageJson = JSON.parse(read('package.json'));
const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
const telemetryPattern = /(?:analytics|telemetry|sentry|datadog|segment|mixpanel|posthog|crashlytics|opentelemetry)/i;
const telemetryDependency = dependencyNames.find((name) => telemetryPattern.test(name));
if (telemetryDependency) fail(`telemetry/crash dependency is not reviewed: ${telemetryDependency}`);

const cargoManifest = read('src-tauri/Cargo.toml');
if (/^(?:tracing|log|sentry|opentelemetry)\s*=/m.test(cargoManifest)) {
  fail('a Rust logging/telemetry dependency was added without review');
}

const tauriAdapter = read('src/lib/wallet/tauri.ts');
if (!tauriAdapter.includes("command<boolean>('wallet_generate_mnemonic'")) {
  fail('generated mnemonic presentation must return only native verification state');
}
if (/command<[^>]*(?:Mnemonic|string)[^>]*>\('wallet_generate_mnemonic'/.test(tauriAdapter)) {
  fail('generated mnemonic material must never be returned through IPC');
}

console.log('Secret surfaces: write-only, bounded, and free of logging/telemetry sinks.');
