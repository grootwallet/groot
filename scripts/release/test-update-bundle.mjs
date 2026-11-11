#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'groot-update-verifier-'));
try {
  const version = '0.1.2';
  const commit = 'a'.repeat(40);
  const minimum = '0.1.0';
  const artifact = join(directory, `Groot-${version}-macos-arm64.dmg`);
  const manifestPath = join(directory, 'update.json');
  const privateKey = join(directory, 'private.pem');
  const publicKey = join(directory, 'public.pem');
  const signature = join(directory, 'update.sig');
  writeFileSync(artifact, 'deterministic disposable update artifact\n');
  const sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  const generator = resolve('scripts/release/generate-update-manifest.mjs');
  const generate = (path, ...metadata) =>
    execFileSync(process.execPath, [generator, path, ...metadata]);
  const manifestBytes = generate(artifact, version, commit, minimum);
  assert.deepEqual(generate(artifact, version, commit, minimum), manifestBytes);
  assert.deepEqual(JSON.parse(manifestBytes), {
    artifact: 'Groot-0.1.2-macos-arm64.dmg',
    channel: 'stable',
    commit,
    minimumSupportedVersion: minimum,
    product: 'Groot',
    rollbackAllowedFrom: [],
    schemaVersion: 1,
    sha256,
    version
  });
  for (const suffix of ['windows-x64.msi', 'linux-x64.deb']) {
    const filename = `Groot-${version}-${suffix}`;
    const path = join(directory, filename);
    writeFileSync(path, 'disposable platform installer\n');
    const result = JSON.parse(generate(path, version, commit, '0.1.2-rc01'));
    assert.equal(result.artifact, filename);
    assert.equal(result.minimumSupportedVersion, '0.1.2-rc01');
  }
  const rejectGeneration = (path, ...metadata) => {
    const result = spawnSync(process.execPath, [generator, path, ...metadata]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.length, 0);
    assert.match(String(result.stderr), /Update manifest generation failed/);
  };
  rejectGeneration(artifact, version, commit);
  rejectGeneration(artifact, '0.1.2-rc01', commit, minimum);
  rejectGeneration(artifact, version, commit.slice(0, 8), minimum);
  rejectGeneration(artifact, version, commit, '0.1.0-01');
  rejectGeneration(artifact, version, commit, '18446744073709551616.0.0');
  rejectGeneration(artifact, '0.1.3', commit, minimum);
  rejectGeneration('Groot-0.1.2-macos-arm64.dmg', version, commit, minimum);
  const restoredVersionPath = join(directory, 'Groot-0.5.4-macos-arm64.dmg');
  writeFileSync(restoredVersionPath, 'disposable installer for the restored version\n');
  rejectGeneration(restoredVersionPath, '0.5.4', commit, '5.3.0');
  assert.equal(
    JSON.parse(generate(restoredVersionPath, '0.5.4', commit, '0.5.3')).minimumSupportedVersion,
    '0.5.3'
  );
  const boundedPath = join(directory, `Groot-${version}-linux-x64.deb`);
  writeFileSync(boundedPath, '');
  rejectGeneration(boundedPath, version, commit, minimum);
  if (process.platform !== 'win32') {
    truncateSync(boundedPath, 2 * 1024 * 1024 * 1024 + 1);
    rejectGeneration(boundedPath, version, commit, minimum);
    rmSync(boundedPath);
    symlinkSync(artifact, boundedPath);
    rejectGeneration(boundedPath, version, commit, minimum);
  }
  writeFileSync(manifestPath, manifestBytes);
  execFileSync('openssl', ['genpkey', '-algorithm', 'Ed25519', '-out', privateKey], {
    stdio: 'ignore'
  });
  chmodSync(privateKey, 0o600);
  execFileSync('openssl', ['pkey', '-in', privateKey, '-pubout', '-out', publicKey], {
    stdio: 'ignore'
  });
  execFileSync('openssl', [
    'pkeyutl',
    '-sign',
    '-rawin',
    '-inkey',
    privateKey,
    '-in',
    manifestPath,
    '-out',
    signature
  ]);
  const verifier = resolve('scripts/release/verify-update-bundle.mjs');
  execFileSync(process.execPath, [verifier, manifestPath, artifact, signature, publicKey], {
    stdio: 'inherit'
  });
  writeFileSync(artifact, 'tampered artifact\n');
  const rejected = spawnSync(process.execPath, [
    verifier,
    manifestPath,
    artifact,
    signature,
    publicKey
  ]);
  if (rejected.status === 0) throw new Error('tampered update was accepted');
  console.log('Signed update verifier rejects tampering.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
