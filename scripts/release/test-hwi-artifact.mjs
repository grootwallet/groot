#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'groot-hwi-verifier-'));
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
try {
  const artifact = join(directory, 'hwi');
  const source = join(directory, 'hwi-source.tar.gz');
  const license = join(directory, 'LICENSE');
  const manifestPath = join(directory, 'hwi-provenance.json');
  writeFileSync(artifact, '#!/bin/sh\nprintf "hwi 3.2.0\\n"\n');
  chmodSync(artifact, 0o700);
  writeFileSync(source, 'disposable source fixture\n');
  writeFileSync(license, 'MIT disposable test fixture\n');
  const manifest = {
    artifact: { filename: 'hwi', sha256: digest(artifact) },
    license: { filename: 'LICENSE', sha256: digest(license) },
    name: 'Bitcoin Core HWI', schemaVersion: 1,
    source: { filename: 'hwi-source.tar.gz', sha256: digest(source) },
    updatePolicy: 'bundled-and-replaced-only-by-signed-groot-release', version: '3.2.0',
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const verifier = resolve('scripts/release/verify-hwi-artifact.mjs');
  execFileSync(process.execPath, [verifier, manifestPath, artifact, source, license], { stdio: 'inherit' });
  writeFileSync(source, 'tampered source\n');
  const rejected = spawnSync(process.execPath, [verifier, manifestPath, artifact, source, license]);
  if (rejected.status === 0) throw new Error('tampered HWI provenance was accepted');
  console.log('HWI provenance verifier rejects tampering.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
