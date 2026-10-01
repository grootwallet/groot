#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const browserOnlyMarkers = [
  'fixture-diagnostics-export-reveal',
  'virtual-ledger-outsider',
  'Network switching is available only in the native multi-network build.'
];

function fail(message) {
  throw new Error(`Native frontend verification failed: ${message}`);
}

function collectJavaScript(directory, root = directory, output = []) {
  const metadata = lstatSync(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail('the frontend output must contain only real directories');
  }
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const child = lstatSync(path);
    if (child.isSymbolicLink()) fail('the frontend output must not contain symlinks');
    if (child.isDirectory()) {
      collectJavaScript(path, root, output);
    } else if (child.isFile() && name.endsWith('.js')) {
      if (child.size <= 0 || child.size > 2 * 1024 * 1024) {
        fail(`invalid JavaScript asset size: ${path.slice(root.length + 1)}`);
      }
      output.push(path);
    }
  }
  return output;
}

export function verifyNativeFrontendOutput(outputPath) {
  const output = resolve(outputPath ?? '');
  const files = collectJavaScript(output);
  if (files.length === 0) fail('no JavaScript assets were generated');
  const source = files.map((path) => readFileSync(path, 'utf8')).join('\n');
  if (!source.includes('runtime_platform')) {
    fail('the native runtime bridge is absent');
  }
  for (const marker of browserOnlyMarkers) {
    if (source.includes(marker)) fail(`browser prototype code survived: ${marker}`);
  }
  return { output, javascriptFiles: files.length };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output || !isAbsolute(resolve(output))) fail('pass a frontend output directory');
  const result = verifyNativeFrontendOutput(output);
  console.log(`Native frontend verified: ${result.javascriptFiles} JavaScript assets`);
}
