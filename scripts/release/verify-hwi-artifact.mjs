#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, readFileSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

const fail = (message) => {
  console.error(`HWI provenance verification failed: ${message}`);
  process.exit(1);
};
if (process.argv.length !== 6) {
  fail('usage: verify-hwi-artifact.mjs MANIFEST ARTIFACT SOURCE_ARCHIVE LICENSE');
}
const [manifestPath, artifactPath, sourcePath, licensePath] = process.argv.slice(2);
const regular = (path, maxBytes) => {
  if (!isAbsolute(path)) fail('all inputs must use absolute paths');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0 || stat.size > maxBytes) {
    fail(`${basename(path)} is not a bounded regular file`);
  }
};
regular(manifestPath, 64 * 1024);
regular(artifactPath, 512 * 1024 * 1024);
regular(sourcePath, 2 * 1024 * 1024 * 1024);
regular(licensePath, 1024 * 1024);

let manifest;
try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { fail('manifest is invalid JSON'); }
const keys = Object.keys(manifest).sort().join(',');
if (keys !== ['artifact', 'license', 'name', 'schemaVersion', 'source', 'updatePolicy', 'version'].sort().join(',')) {
  fail('manifest fields do not match schema version 1');
}
if (manifest.schemaVersion !== 1 || manifest.name !== 'Bitcoin Core HWI' ||
    manifest.updatePolicy !== 'bundled-and-replaced-only-by-signed-groot-release') {
  fail('component identity or update policy is invalid');
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail('HWI version must be exact');
for (const [entry, path, label] of [
  [manifest.artifact, artifactPath, 'artifact'],
  [manifest.source, sourcePath, 'source'],
  [manifest.license, licensePath, 'license'],
]) {
  if (!entry || Object.keys(entry).sort().join(',') !== 'filename,sha256') fail(`${label} schema is invalid`);
  if (entry.filename !== basename(path) || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
    fail(`${label} filename or digest is invalid`);
  }
  const digest = await new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
  if (digest !== entry.sha256) fail(`${label} digest does not match`);
}
const version = spawnSync(artifactPath, ['--version'], {
  encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024, env: { PATH: '/usr/bin:/bin' },
});
if (version.error || version.status !== 0 || version.signal ||
    !new RegExp(`(^|\\s)${manifest.version.replaceAll('.', '\\.')}($|\\s)`).test(version.stdout.trim())) {
  fail('artifact --version does not match the manifest');
}
console.log(`Verified Bitcoin Core HWI ${manifest.version} artifact and provenance inputs.`);
