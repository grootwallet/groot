#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
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

export function validateCompiledTeamId(executableBytes, expectedTeamId) {
  const marker = Buffer.from(`GROOT_COMPILED_MACOS_SIGNING_TEAM_ID:${expectedTeamId}`, 'utf8');
  if (!Buffer.from(executableBytes).includes(marker)) {
    throw new Error('Groot was not compiled with the expected Developer ID team requirement');
  }
}

function codesignOutput(codesignArguments) {
  const result = spawnSync('codesign', codesignArguments, { encoding: 'utf8' });
  if (result.status !== 0) fail(`codesign inspection failed for ${codesignArguments.at(-1)}`);
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function hasTrueEntitlement(output, key) {
  return new RegExp(`<key>\\s*${key.replaceAll('.', '\\.')}\\s*</key>\\s*<true\\s*/>`).test(output);
}

export function validateProductionSignatureMetadata(
  appSignature,
  hwiSignature,
  appEntitlements,
  hwiEntitlements,
  expectedTeamId
) {
  if (!/^[A-Z0-9]{10}$/.test(expectedTeamId ?? '')) {
    throw new Error('production verification requires the expected 10-character Developer ID team');
  }
  if (!/flags=.*\bruntime\b/.test(hwiSignature) || !/flags=.*\bruntime\b/.test(appSignature)) {
    throw new Error('Groot and HWI must both use the hardened runtime');
  }
  const team = (value) => value.match(/^TeamIdentifier=(?!not set$)([A-Z0-9]{10})$/m)?.[1];
  const appTeam = team(appSignature);
  const hwiTeam = team(hwiSignature);
  if (!appTeam || appTeam !== hwiTeam || appTeam !== expectedTeamId) {
    throw new Error('Groot and HWI must use the expected matching Developer ID team');
  }
  const developerIdAuthority = /^Authority=Developer ID Application:.+$/m;
  if (!developerIdAuthority.test(appSignature) || !developerIdAuthority.test(hwiSignature)) {
    throw new Error('Groot and HWI must use Developer ID Application certificates');
  }
  if (
    !/^Timestamp=(?!none$).+/m.test(appSignature) ||
    !/^Timestamp=(?!none$).+/m.test(hwiSignature)
  ) {
    throw new Error('Groot and HWI must both carry secure timestamps');
  }
  const libraryValidation = 'com.apple.security.cs.disable-library-validation';
  if (!hasTrueEntitlement(hwiEntitlements, libraryValidation)) {
    throw new Error('HWI is missing its reviewed library-validation entitlement');
  }
  if (hasTrueEntitlement(appEntitlements, libraryValidation)) {
    throw new Error('Groot must not disable library validation');
  }
}

export function verifyPackagedHwi(
  appPath,
  {
    manifestPath = canonicalManifestPath,
    expectedAppVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version,
    expectedTeamId = process.env.GROOT_MACOS_SIGNING_TEAM_ID,
    requireProductionSigning = true
  } = {}
) {
  if (process.platform !== 'darwin') {
    fail('macOS package verification requires macOS codesign and PlistBuddy');
  }
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
  if (requireProductionSigning) {
    const plist = join(app, 'Contents', 'Info.plist');
    const executableName = execFileSync(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleExecutable', plist],
      { encoding: 'utf8' }
    ).trim();
    validateCompiledTeamId(
      readFileSync(join(app, 'Contents', 'MacOS', executableName)),
      expectedTeamId
    );
    const hwiSignature = codesignOutput(['-d', '--verbose=4', hwi]);
    const appSignature = codesignOutput(['-d', '--verbose=4', app]);
    const hwiEntitlements = codesignOutput(['-d', '--entitlements', ':-', hwi]);
    const appEntitlements = codesignOutput(['-d', '--entitlements', ':-', app]);
    try {
      validateProductionSignatureMetadata(
        appSignature,
        hwiSignature,
        appEntitlements,
        hwiEntitlements,
        expectedTeamId
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

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
