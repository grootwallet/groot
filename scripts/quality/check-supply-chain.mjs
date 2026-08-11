#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const fail = (message) => {
  console.error(`Supply-chain gate failed: ${message}`);
  process.exit(1);
};

const packageJson = JSON.parse(read('package.json'));
for (const [name, version] of Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Node dependency ${name} must use one exact version, found ${version}`);
  }
}
if (packageJson.packageManager !== 'pnpm@11.13.1' || packageJson.engines?.node !== '24.19.0') {
  fail('the pnpm and Node toolchain versions must remain exact');
}

const npmrc = read('.npmrc');
for (const setting of ['ignore-scripts=true', 'engine-strict=true', 'save-exact=true', 'verify-store-integrity=true']) {
  if (!npmrc.split('\n').includes(setting)) fail(`.npmrc is missing ${setting}`);
}

const cargo = JSON.parse(execFileSync(
  'cargo',
  ['metadata', '--locked', '--no-deps', '--format-version', '1'],
  { cwd: `${rootPath}src-tauri`, encoding: 'utf8' }
));
for (const dependency of cargo.packages[0].dependencies) {
  if (dependency.source === null) continue;
  if (!/^=\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(dependency.req)) {
    fail(`Rust dependency ${dependency.name} must use one exact version, found ${dependency.req}`);
  }
}

const workflow = read('.github/workflows/ci.yml');
for (const line of workflow.split('\n')) {
  const action = line.match(/^\s*- uses: ([^\s]+)$/)?.[1];
  if (action && !/@[a-f0-9]{40}$/.test(action)) fail(`GitHub Action is not immutable-SHA pinned: ${action}`);
}
if (!/^permissions:\n  contents: read$/m.test(workflow)) fail('CI default permissions must remain contents: read');
if (/persist-credentials:\s*true/.test(workflow)) fail('CI checkout credentials must not persist');

console.log('Supply chain: direct dependencies, toolchains, CI actions, and install policy are exact-pinned.');
