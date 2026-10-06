#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';

const fail = (message) => {
  console.error(`Release evidence verification failed: ${message}`);
  process.exit(1);
};

const regular = (path, maxBytes) => {
  if (!isAbsolute(path)) fail('all inputs must use absolute paths');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0 || stat.size > maxBytes) {
    fail(`${basename(path)} is not a bounded regular file`);
  }
};

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

if (process.argv.length !== 9) {
  fail(
    'usage: verify-release-evidence.mjs STATEMENT SIGNATURE PUBLIC_KEY SHA256SUMS PROVENANCE EXPECTED_VERSION EXPECTED_COMMIT'
  );
}

const [
  statementPath,
  signaturePath,
  publicKeyPath,
  checksumsPath,
  provenancePath,
  expectedVersion,
  expectedCommit
] = process.argv.slice(2);

regular(statementPath, 64 * 1024);
regular(signaturePath, 16 * 1024);
regular(publicKeyPath, 64 * 1024);
regular(checksumsPath, 1024 * 1024);
regular(provenancePath, 4 * 1024 * 1024);

let statement;
try {
  statement = JSON.parse(readFileSync(statementPath, 'utf8'));
} catch {
  fail('statement is not valid JSON');
}

const exactKeys = [
  'checksumFile',
  'checksumSha256',
  'commit',
  'product',
  'provenanceFile',
  'provenanceSha256',
  'schemaVersion',
  'tag',
  'version'
].sort();
if (JSON.stringify(Object.keys(statement).sort()) !== JSON.stringify(exactKeys)) {
  fail('statement fields do not match schema version 1');
}

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
if (statement.schemaVersion !== 1 || statement.product !== 'Groot') {
  fail('statement identity is invalid');
}
if (!semver.test(statement.version) || statement.tag !== `v${statement.version}`) {
  fail('statement version and tag are inconsistent');
}
if (statement.version !== expectedVersion) fail('statement version is not the expected release');
if (!/^[0-9a-f]{40}$/.test(statement.commit) || statement.commit !== expectedCommit) {
  fail('statement commit is not the expected release commit');
}
if (
  statement.checksumFile !== basename(checksumsPath) ||
  statement.provenanceFile !== basename(provenancePath)
) {
  fail('statement evidence filenames do not match the supplied files');
}
if (statement.checksumSha256 !== sha256(checksumsPath)) {
  fail('SHA256SUMS digest does not match the signed statement');
}
if (statement.provenanceSha256 !== sha256(provenancePath)) {
  fail('PROVENANCE.json digest does not match the signed statement');
}

try {
  execFileSync(
    'openssl',
    [
      'pkeyutl',
      '-verify',
      '-rawin',
      '-pubin',
      '-inkey',
      publicKeyPath,
      '-sigfile',
      signaturePath,
      '-in',
      statementPath
    ],
    { stdio: 'pipe', timeout: 10_000, maxBuffer: 64 * 1024 }
  );
} catch {
  fail('statement signature is invalid');
}

console.log(
  `Verified signed Groot ${statement.version} release evidence at ${statement.commit.slice(0, 8)}.`
);
