#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const root = new URL('../../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const fail = (message) => {
  console.error(`Supply-chain gate failed: ${message}`);
  process.exit(1);
};

const packageJson = JSON.parse(read('package.json'));
for (const [name, version] of Object.entries({
  ...packageJson.dependencies,
  ...packageJson.devDependencies
})) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Node dependency ${name} must use one exact version, found ${version}`);
  }
}
if (packageJson.packageManager !== 'pnpm@11.13.1' || packageJson.engines?.node !== '24.19.0') {
  fail('the pnpm and Node toolchain versions must remain exact');
}

const npmrc = read('.npmrc');
for (const setting of [
  'ignore-scripts=true',
  'engine-strict=true',
  'save-exact=true',
  'verify-store-integrity=true'
]) {
  if (!npmrc.split('\n').includes(setting)) fail(`.npmrc is missing ${setting}`);
}

const cargo = JSON.parse(
  execFileSync('cargo', ['metadata', '--locked', '--no-deps', '--format-version', '1'], {
    cwd: `${rootPath}src-tauri`,
    encoding: 'utf8'
  })
);
for (const dependency of cargo.packages[0].dependencies) {
  if (dependency.source === null) continue;
  if (!/^=\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(dependency.req)) {
    fail(`Rust dependency ${dependency.name} must use one exact version, found ${dependency.req}`);
  }
}

const workflowActions = (source, label) => {
  const document = parseDocument(source, {
    maxAliasCount: 100,
    prettyErrors: false,
    uniqueKeys: true
  });
  if (document.errors.length > 0) fail(`cannot parse ${label}: ${document.errors[0].message}`);
  let rootValue;
  try {
    rootValue = document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    fail(`cannot resolve ${label}: ${error instanceof Error ? error.message : error}`);
  }
  const actions = [];
  const visited = new WeakSet();
  const visit = (value) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'uses') {
        if (typeof child !== 'string' || child.trim().length === 0) {
          fail(`${label} contains a non-string GitHub Action reference`);
        }
        actions.push(child.trim());
      }
      visit(child);
    }
  };
  visit(rootValue);
  return actions;
};

const immutableAction = 'owner/action@0123456789abcdef0123456789abcdef01234567';
const isImmutableAction = (action) => /@[a-f0-9]{40}$/.test(action);
for (const [source, label] of [
  [`steps:\n  - uses: ${immutableAction}`, 'plain key'],
  [`steps:\n  - "uses": "${immutableAction}"`, 'quoted key'],
  [`steps: [{ "uses": ${immutableAction} }]`, 'flow mapping'],
  [`steps:\n  - "u\\u0073es": ${immutableAction}`, 'escaped key'],
  [`steps:\n  - &action\n    uses: ${immutableAction}\n  - *action`, 'alias']
]) {
  const actions = workflowActions(source, `internal ${label} fixture`);
  if (actions.length !== 1 || actions[0] !== immutableAction) {
    fail(`internal GitHub Action parser regression for ${label}`);
  }
}
for (const [source, label] of [
  ['steps: [{ uses: owner/action@v1 }]', 'mutable flow mapping'],
  ['steps:\n  - "u\\u0073es": owner/action@v1', 'mutable escaped key'],
  ['steps:\n  - &action\n    uses: owner/action@v1\n  - *action', 'mutable alias']
]) {
  const actions = workflowActions(source, `internal ${label} fixture`);
  if (actions.length !== 1 || isImmutableAction(actions[0])) {
    fail(`internal GitHub Action parser regression for ${label}`);
  }
}

const workflowDirectory = new URL('.github/workflows/', root);
const workflowFiles = readdirSync(workflowDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort();
if (workflowFiles.length === 0) fail('no GitHub Actions workflows were found');
for (const file of workflowFiles) {
  for (const action of workflowActions(read(`.github/workflows/${file}`), file)) {
    if (!isImmutableAction(action)) {
      fail(`GitHub Action is not immutable-SHA pinned in ${file}: ${action}`);
    }
  }
}
const workflow = read('.github/workflows/ci.yml');
if (!/^permissions:\n  contents: read$/m.test(workflow))
  fail('CI default permissions must remain contents: read');
if (/persist-credentials:\s*true/.test(workflow)) fail('CI checkout credentials must not persist');

console.log(
  'Supply chain: direct dependencies, toolchains, CI actions, and install policy are exact-pinned.'
);
