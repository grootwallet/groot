#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const canonicalManifestPath = resolve(repoRoot, 'docs/hwi-artifact-manifest-3.2.0-mac-arm64.json');
const libraryValidation = 'com.apple.security.cs.disable-library-validation';

function fail(message) {
  throw new Error(`Signed HWI verification failed: ${message}`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} has an unsupported schema`);
  }
}

function codesignOutput(arguments_) {
  const result = spawnSync('codesign', arguments_, { encoding: 'utf8' });
  if (result.status !== 0) fail(`codesign inspection failed for ${arguments_.at(-1)}`);
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

export function probeHwiVersionOnDisposableCopy(hwi) {
  const probeDirectory = mkdtempSync(resolve(tmpdir(), 'groot-hwi-version-'));
  const probe = resolve(probeDirectory, 'hwi');
  try {
    copyFileSync(hwi, probe);
    chmodSync(probe, 0o700);
    return execFileSync(probe, ['--version'], {
      encoding: 'utf8',
      env: { HOME: process.env.HOME ?? '/var/empty' },
      timeout: 30_000
    }).trim();
  } finally {
    rmSync(probeDirectory, { recursive: true, force: true });
  }
}

export function validateSignedHwiSignatureMetadata(signature, entitlements, expectedTeamId) {
  if (!/^[A-Z0-9]{10}$/.test(expectedTeamId ?? '')) {
    throw new Error('signed HWI verification requires the expected 10-character Developer ID team');
  }
  if (!/flags=.*\bruntime\b/.test(signature)) {
    throw new Error('HWI must use the hardened runtime');
  }
  if (!new RegExp(`^TeamIdentifier=${expectedTeamId}$`, 'm').test(signature)) {
    throw new Error('HWI does not use the expected Developer ID team');
  }
  if (!/^Authority=Developer ID Application:.+$/m.test(signature)) {
    throw new Error('HWI must use a Developer ID Application certificate');
  }
  if (!/^Timestamp=(?!none$).+/m.test(signature)) {
    throw new Error('HWI must carry a secure timestamp');
  }
  if (
    !new RegExp(
      `<key>\\s*${libraryValidation.replaceAll('.', '\\.')}\\s*</key>\\s*<true\\s*/>`
    ).test(entitlements)
  ) {
    throw new Error('HWI is missing its reviewed library-validation entitlement');
  }
}

export function verifySignedHwiArtifact(hwiPath, manifestPath, expectedTeamId) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail('verification requires macOS Apple silicon');
  }
  const hwi = resolve(hwiPath ?? '');
  const manifestFile = resolve(manifestPath ?? '');
  for (const [path, label] of [
    [hwi, 'HWI artifact'],
    [manifestFile, 'signed HWI manifest']
  ]) {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) fail(`${label} must be a regular file`);
    if (metadata.size <= 0 || metadata.size > 200 * 1024 * 1024) fail(`${label} size is invalid`);
  }
  if (basename(hwi) !== 'hwi') fail('the signed helper filename must be hwi');
  const mode = statSync(hwi).mode;
  if ((mode & 0o111) === 0 || (mode & 0o022) !== 0) {
    fail('the signed helper must be executable and not group/world writable');
  }

  const canonical = JSON.parse(readFileSync(canonicalManifestPath, 'utf8'));
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  exactKeys(
    manifest,
    ['schemaVersion', 'kind', 'version', 'platform', 'artifact', 'upstream', 'signing'],
    'signed HWI manifest'
  );
  exactKeys(manifest.artifact, ['filename', 'sha256'], 'signed HWI artifact');
  exactKeys(
    manifest.upstream,
    ['filename', 'sha256', 'sourceArchiveSha256', 'licenseSha256'],
    'signed HWI upstream provenance'
  );
  exactKeys(
    manifest.signing,
    ['teamId', 'hardenedRuntime', 'secureTimestamp', 'entitlements'],
    'signed HWI signature metadata'
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== 'groot-signed-hwi' ||
    manifest.version !== canonical.version ||
    manifest.platform !== 'macos-arm64' ||
    manifest.artifact.filename !== 'hwi' ||
    manifest.upstream.filename !== canonical.artifact.filename ||
    manifest.upstream.sha256 !== canonical.artifact.sha256 ||
    manifest.upstream.sourceArchiveSha256 !== canonical.source.sha256 ||
    manifest.upstream.licenseSha256 !== canonical.license.sha256 ||
    manifest.signing.teamId !== expectedTeamId ||
    manifest.signing.hardenedRuntime !== true ||
    manifest.signing.secureTimestamp !== true ||
    JSON.stringify(manifest.signing.entitlements) !== JSON.stringify([libraryValidation])
  ) {
    fail('signed HWI manifest does not match the reviewed upstream and signing policy');
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.artifact.sha256)) fail('signed HWI digest is invalid');
  if (digest(hwi) !== manifest.artifact.sha256) fail('signed HWI digest does not match');

  execFileSync('codesign', ['--verify', '--strict', '--verbose=2', hwi], { stdio: 'pipe' });
  try {
    validateSignedHwiSignatureMetadata(
      codesignOutput(['-d', '--verbose=4', hwi]),
      codesignOutput(['-d', '--entitlements', ':-', hwi]),
      expectedTeamId
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  // PyInstaller one-file executables can cause macOS to invalidate the vnode they
  // execute from even when their bytes remain unchanged. Never execute the frozen
  // release input itself: probe an authenticated disposable copy instead.
  const version = probeHwiVersionOnDisposableCopy(hwi);
  if (version !== `hwi ${canonical.version}`) fail(`unexpected version output: ${version}`);
  execFileSync('codesign', ['--verify', '--strict', '--verbose=2', hwi], { stdio: 'pipe' });
  return { hwi, manifestFile, manifest, version };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = verifySignedHwiArtifact(process.argv[2], process.argv[3], process.argv[4]);
  console.log(`Signed HWI verified: ${result.version}, ${result.manifest.artifact.sha256}`);
}
