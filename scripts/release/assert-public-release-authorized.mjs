#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));

function reject(message) {
  throw new Error(`Public release authorization failed: ${message}`);
}

export function verifyPublicReleaseAuthorization({ repoRoot = defaultRepoRoot, commit }) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) reject('the candidate commit is invalid');

  const packageMetadata = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const version = packageMetadata.version;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) reject('the package version is invalid');
  const tag = `v${version}`;
  const authorizationPath = join(repoRoot, 'docs/mainnet-release-authorization.json');
  const authorization = JSON.parse(readFileSync(authorizationPath, 'utf8'));
  const expectedKeys = [
    'authorizedTag',
    'authorizedVersion',
    'decisionAdr',
    'schemaVersion',
    'status'
  ];
  if (JSON.stringify(Object.keys(authorization).sort()) !== JSON.stringify(expectedKeys)) {
    reject('the authorization record has an unexpected shape');
  }
  if (authorization.schemaVersion !== 2) reject('the authorization schema is unsupported');
  if (authorization.status !== 'approved') reject('Mainnet public distribution remains blocked');
  if (authorization.authorizedVersion !== version) {
    reject('the authorization does not name the package version');
  }
  if (authorization.authorizedTag !== tag)
    reject('the authorization does not name the release tag');
  if (!/^\d{4}$/.test(authorization.decisionAdr ?? '')) {
    reject('the authorization does not name a valid decision ADR');
  }

  const checklist = readFileSync(join(repoRoot, 'docs/mainnet-release-checklist.md'), 'utf8');
  if (!/^Release decision: APPROVED$/m.test(checklist)) {
    reject('the canonical checklist is not approved');
  }
  if (/^- \[ \]/m.test(checklist)) reject('the canonical checklist still has open items');

  const adrPrefix = `${authorization.decisionAdr}-`;
  const adrMatches = readdirSync(join(repoRoot, 'docs/adr')).filter(
    (name) => name.startsWith(adrPrefix) && name.endsWith('.md')
  );
  if (adrMatches.length !== 1) reject('the decision ADR is missing or ambiguous');
  const adrPath = join(repoRoot, 'docs/adr', adrMatches[0]);
  if (!existsSync(adrPath)) reject('the decision ADR is missing');
  const adr = readFileSync(adrPath, 'utf8');
  if (!/^- Status: accepted$/m.test(adr)) reject('the decision ADR is not accepted');
  const authorizationSentence = `Authorizes: public Mainnet distribution for version ${version} when annotated tag ${tag} and origin/main resolve to the same commit`;
  if (!adr.split('\n').includes(authorizationSentence)) {
    reject('the decision ADR does not authorize the package version and release tag');
  }

  return { authorizationPath, adrPath, commit, version, tag };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [commit] = process.argv.slice(2);
  try {
    const authorization = verifyPublicReleaseAuthorization({ commit });
    console.log(
      `Public release authorization: approved for ${authorization.version} (${authorization.tag})`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
