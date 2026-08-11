#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, readFileSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

const fail = (message) => {
  console.error(`Update verification failed: ${message}`);
  process.exit(1);
};
const regular = (path, maxBytes) => {
  if (!isAbsolute(path)) fail('all inputs must use absolute paths');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0 || stat.size > maxBytes) {
    fail(`${basename(path)} is not a bounded regular file`);
  }
};

if (process.argv.length !== 6) {
  fail('usage: verify-update-bundle.mjs MANIFEST ARTIFACT SIGNATURE PUBLIC_KEY');
}
const [manifestPath, artifactPath, signaturePath, publicKeyPath] = process.argv.slice(2);
regular(manifestPath, 64 * 1024);
regular(artifactPath, 2 * 1024 * 1024 * 1024);
regular(signaturePath, 16 * 1024);
regular(publicKeyPath, 64 * 1024);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  fail('manifest is not valid JSON');
}
const exactKeys = [
  'artifact', 'channel', 'commit', 'minimumSupportedVersion', 'product',
  'rollbackAllowedFrom', 'schemaVersion', 'sha256', 'version',
].sort();
if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(exactKeys)) {
  fail('manifest fields do not match schema version 1');
}
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
if (manifest.schemaVersion !== 1 || manifest.product !== 'Groot' || manifest.channel !== 'stable') {
  fail('manifest identity or channel is invalid');
}
if (!semver.test(manifest.version) || !semver.test(manifest.minimumSupportedVersion)) {
  fail('manifest versions must be exact semantic versions');
}
if (!/^[0-9a-f]{40}$/.test(manifest.commit)) fail('commit must be a full lowercase SHA-1');
if (manifest.artifact !== basename(artifactPath) || basename(manifest.artifact) !== manifest.artifact) {
  fail('artifact filename does not match the manifest');
}
if (!Array.isArray(manifest.rollbackAllowedFrom) ||
    !manifest.rollbackAllowedFrom.every((value) => typeof value === 'string' && semver.test(value))) {
  fail('rollback allowlist is invalid');
}
const digest = await new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(artifactPath)
    .on('data', (chunk) => hash.update(chunk))
    .on('error', reject)
    .on('end', () => resolve(hash.digest('hex')));
});
if (manifest.sha256 !== digest) fail('artifact digest does not match');
try {
  execFileSync('openssl', [
    'pkeyutl', '-verify', '-rawin', '-pubin', '-inkey', publicKeyPath,
    '-sigfile', signaturePath, '-in', manifestPath,
  ], { stdio: 'pipe', timeout: 10_000, maxBuffer: 64 * 1024 });
} catch {
  fail('manifest signature is invalid');
}
console.log(`Verified signed Groot ${manifest.version} update ${manifest.artifact}.`);
