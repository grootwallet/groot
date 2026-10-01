#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySignedHwiArtifact } from './verify-signed-hwi.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const canonicalManifestPath = join(repoRoot, 'docs/hwi-artifact-manifest-3.2.0-mac-arm64.json');
const entitlementsPath = join(repoRoot, 'scripts/release/hwi-entitlements.plist');

function fail(message) {
  throw new Error(`Signed HWI preparation failed: ${message}`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  fail('preparation requires macOS Apple silicon');
}
const [sourceArgument, outputArgument] = process.argv.slice(2);
if (
  !sourceArgument ||
  !outputArgument ||
  !isAbsolute(sourceArgument) ||
  !isAbsolute(outputArgument)
) {
  fail('usage: prepare-signed-hwi.mjs /absolute/path/to/hwi /new/absolute/output-directory');
}
const identity = process.env.GROOT_MACOS_SIGNING_IDENTITY;
const teamId = process.env.GROOT_MACOS_SIGNING_TEAM_ID;
if (!identity) fail('set GROOT_MACOS_SIGNING_IDENTITY to the reviewed Developer ID identity');
if (!/^[A-Z0-9]{10}$/.test(teamId ?? '')) {
  fail('set GROOT_MACOS_SIGNING_TEAM_ID to the reviewed 10-character team');
}
const source = resolve(sourceArgument);
const output = resolve(outputArgument);
const sourceMetadata = lstatSync(source);
if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) fail('source HWI is invalid');
if ((statSync(source).mode & 0o111) === 0) fail('source HWI is not executable');
const canonical = JSON.parse(readFileSync(canonicalManifestPath, 'utf8'));
if (digest(source) !== canonical.artifact.sha256) fail('source HWI digest is not canonical');
const version = execFileSync(source, ['--version'], {
  encoding: 'utf8',
  env: { HOME: process.env.HOME ?? '/var/empty' },
  timeout: 30_000
}).trim();
if (version !== `hwi ${canonical.version}`) fail(`unexpected source version: ${version}`);

mkdirSync(output, { recursive: false, mode: 0o700 });
const signedHwi = join(output, 'hwi');
const signedManifest = join(output, 'signed-hwi-manifest.json');
copyFileSync(source, signedHwi);
chmodSync(signedHwi, 0o755);
execFileSync(
  'codesign',
  [
    '--force',
    '--sign',
    identity,
    '--options',
    'runtime',
    '--timestamp',
    '--entitlements',
    entitlementsPath,
    signedHwi
  ],
  { stdio: 'inherit' }
);

const manifest = {
  schemaVersion: 1,
  kind: 'groot-signed-hwi',
  version: canonical.version,
  platform: 'macos-arm64',
  artifact: { filename: 'hwi', sha256: digest(signedHwi) },
  upstream: {
    filename: canonical.artifact.filename,
    sha256: canonical.artifact.sha256,
    sourceArchiveSha256: canonical.source.sha256,
    licenseSha256: canonical.license.sha256
  },
  signing: {
    teamId,
    hardenedRuntime: true,
    secureTimestamp: true,
    entitlements: ['com.apple.security.cs.disable-library-validation']
  }
};
writeFileSync(signedManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
verifySignedHwiArtifact(signedHwi, signedManifest, teamId);
writeFileSync(
  join(output, 'SHA256SUMS'),
  `${digest(signedHwi)}  hwi\n${digest(signedManifest)}  signed-hwi-manifest.json\n`,
  { mode: 0o600 }
);
console.log(`Signed HWI evidence: ${output}`);
