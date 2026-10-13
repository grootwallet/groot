import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const verifier = resolve('scripts/release/verify-release-evidence.mjs');
const version = '0.5.0';
const commit = 'a'.repeat(40);

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const generateKey = (directory, name) => {
  const privateKey = join(directory, `${name}-private.pem`);
  const publicKey = join(directory, `${name}-public.pem`);
  execFileSync('openssl', ['genpkey', '-algorithm', 'Ed25519', '-out', privateKey], {
    stdio: 'ignore'
  });
  chmodSync(privateKey, 0o600);
  execFileSync('openssl', ['pkey', '-in', privateKey, '-pubout', '-out', publicKey], {
    stdio: 'ignore'
  });
  return { privateKey, publicKey };
};

const sign = (statement, signature, privateKey) =>
  execFileSync('openssl', [
    'pkeyutl',
    '-sign',
    '-rawin',
    '-inkey',
    privateKey,
    '-in',
    statement,
    '-out',
    signature
  ]);

const runVerifier = ({ statement, signature, publicKey, checksums, provenance, expectedVersion }) =>
  spawnSync(
    process.execPath,
    [
      verifier,
      statement,
      signature,
      publicKey,
      checksums,
      provenance,
      expectedVersion ?? version,
      commit
    ],
    { encoding: 'utf8' }
  );

test('release evidence signature binds version, commit, checksums, provenance, and key', () => {
  const directory = mkdtempSync(join(tmpdir(), 'groot-release-evidence-'));
  try {
    const checksums = join(directory, 'SHA256SUMS');
    const provenance = join(directory, 'PROVENANCE.json');
    const statement = join(directory, 'RELEASE-EVIDENCE.json');
    const signature = join(directory, 'RELEASE-EVIDENCE.sig');
    const trusted = generateKey(directory, 'trusted');
    const wrong = generateKey(directory, 'wrong');
    writeFileSync(checksums, `${'b'.repeat(64)}  Groot.dmg\n`);
    writeFileSync(provenance, `${JSON.stringify({ commit, version })}\n`);
    const signedStatement = {
      checksumFile: 'SHA256SUMS',
      checksumSha256: digest(checksums),
      commit,
      product: 'Groot',
      provenanceFile: 'PROVENANCE.json',
      provenanceSha256: digest(provenance),
      schemaVersion: 1,
      tag: `v${version}`,
      version
    };
    writeFileSync(statement, `${JSON.stringify(signedStatement, null, 2)}\n`);
    sign(statement, signature, trusted.privateKey);

    assert.equal(
      runVerifier({ statement, signature, publicKey: trusted.publicKey, checksums, provenance })
        .status,
      0
    );
    assert.notEqual(
      runVerifier({
        statement,
        signature,
        publicKey: wrong.publicKey,
        checksums,
        provenance
      }).status,
      0
    );
    assert.notEqual(
      runVerifier({
        statement,
        signature,
        publicKey: trusted.publicKey,
        checksums,
        provenance,
        expectedVersion: '0.5.1'
      }).status,
      0
    );

    writeFileSync(checksums, `${'c'.repeat(64)}  Groot.dmg\n`);
    assert.notEqual(
      runVerifier({ statement, signature, publicKey: trusted.publicKey, checksums, provenance })
        .status,
      0
    );
    writeFileSync(checksums, `${'b'.repeat(64)}  Groot.dmg\n`);
    writeFileSync(provenance, `${JSON.stringify({ commit: 'd'.repeat(40), version })}\n`);
    assert.notEqual(
      runVerifier({ statement, signature, publicKey: trusted.publicKey, checksums, provenance })
        .status,
      0
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
