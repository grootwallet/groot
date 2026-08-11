#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'groot-update-verifier-'));
try {
  const artifact = join(directory, 'Groot.dmg');
  const manifestPath = join(directory, 'update.json');
  const privateKey = join(directory, 'private.pem');
  const publicKey = join(directory, 'public.pem');
  const signature = join(directory, 'update.sig');
  writeFileSync(artifact, 'deterministic disposable update artifact\n');
  const sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  const manifest = {
    artifact: 'Groot.dmg', channel: 'stable', commit: 'a'.repeat(40),
    minimumSupportedVersion: '0.1.0', product: 'Groot', rollbackAllowedFrom: ['0.1.1'],
    schemaVersion: 1, sha256, version: '0.1.2',
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync('openssl', ['genpkey', '-algorithm', 'Ed25519', '-out', privateKey], { stdio: 'ignore' });
  chmodSync(privateKey, 0o600);
  execFileSync('openssl', ['pkey', '-in', privateKey, '-pubout', '-out', publicKey], { stdio: 'ignore' });
  execFileSync('openssl', ['pkeyutl', '-sign', '-rawin', '-inkey', privateKey, '-in', manifestPath, '-out', signature]);
  const verifier = resolve('scripts/release/verify-update-bundle.mjs');
  execFileSync(process.execPath, [verifier, manifestPath, artifact, signature, publicKey], { stdio: 'inherit' });
  writeFileSync(artifact, 'tampered artifact\n');
  const rejected = spawnSync(process.execPath, [verifier, manifestPath, artifact, signature, publicKey]);
  if (rejected.status === 0) throw new Error('tampered update was accepted');
  console.log('Signed update verifier rejects tampering.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
