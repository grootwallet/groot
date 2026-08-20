#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const canonicalManifestPath = join(repoRoot, 'docs/hwi-artifact-manifest-3.2.0-mac-arm64.json');

function fail(message) {
  throw new Error(`Packaged HWI verification failed: ${message}`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function verifyPackagedHwi(
  appPath,
  {
    manifestPath = canonicalManifestPath,
    expectedAppVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
  } = {}
) {
  if (!appPath || !resolve(appPath).endsWith('.app')) fail('pass a macOS .app bundle path');
  const app = resolve(appPath);
  const appMetadata = lstatSync(app);
  if (appMetadata.isSymbolicLink() || !appMetadata.isDirectory())
    fail('app is not a real directory');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.artifact?.filename !== 'hwi') {
    fail('unsupported artifact manifest');
  }
  const hwi = join(app, 'Contents', 'Resources', 'hwi');
  const linkMetadata = lstatSync(hwi);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) fail('HWI is not a regular file');
  const metadata = statSync(hwi);
  if ((metadata.mode & 0o111) === 0) fail('HWI is not executable');
  if ((metadata.mode & 0o022) !== 0) fail('HWI is group- or world-writable');
  if (basename(hwi) !== manifest.artifact.filename) fail('unexpected HWI resource name');
  if (digest(hwi) !== manifest.artifact.sha256) fail('HWI SHA-256 does not match the manifest');

  const version = execFileSync(hwi, ['--version'], {
    encoding: 'utf8',
    env: { HOME: process.env.HOME ?? '/var/empty' },
    timeout: 30_000
  }).trim();
  if (version !== `hwi ${manifest.version}`) fail(`unexpected version output: ${version}`);

  execFileSync('codesign', ['--verify', '--strict', '--verbose=2', hwi], { stdio: 'pipe' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
    stdio: 'pipe'
  });

  const plist = join(app, 'Contents', 'Info.plist');
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
    const value = execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {
      encoding: 'utf8'
    }).trim();
    if (value !== expectedAppVersion) fail(`${key} is ${value}, expected ${expectedAppVersion}`);
  }
  return { app, hwi, version, sha256: manifest.artifact.sha256, appVersion: expectedAppVersion };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = verifyPackagedHwi(process.argv[2]);
  console.log(
    `Packaged HWI verified: Groot ${result.appVersion}, ${result.version}, ${result.sha256}`
  );
}
