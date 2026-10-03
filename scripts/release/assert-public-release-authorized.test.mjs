import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyPublicReleaseAuthorization } from './assert-public-release-authorized.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';

function fixture({ status = 'blocked', authorizedCommit = null, decisionAdr = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'groot-release-authorization-'));
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  writeFileSync(
    join(root, 'docs/mainnet-release-authorization.json'),
    `${JSON.stringify({ schemaVersion: 1, status, authorizedCommit, decisionAdr }, null, 2)}\n`
  );
  writeFileSync(
    join(root, 'docs/mainnet-release-checklist.md'),
    '# Mainnet release checklist\n\nRelease decision: BLOCKED\n\n- [ ] Evidence remains open.\n'
  );
  return root;
}

test('current blocked authorization cannot be used for public packaging', () => {
  const root = fixture();
  try {
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /public distribution remains blocked/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('approval must bind the exact commit, accepted ADR, and closed checklist', () => {
  const root = fixture({ status: 'approved', authorizedCommit: commit, decisionAdr: '0081' });
  try {
    writeFileSync(
      join(root, 'docs/mainnet-release-checklist.md'),
      '# Mainnet release checklist\n\nRelease decision: APPROVED\n\n- [x] Evidence complete.\n'
    );
    writeFileSync(
      join(root, 'docs/adr/0081-authorize-mainnet.md'),
      `# ADR 0081\n\n- Status: accepted\n\nAuthorizes: public Mainnet distribution for commit ${commit}\n`
    );
    assert.doesNotThrow(() => verifyPublicReleaseAuthorization({ repoRoot: root, commit }));
    assert.throws(
      () =>
        verifyPublicReleaseAuthorization({
          repoRoot: root,
          commit: 'ffffffffffffffffffffffffffffffffffffffff'
        }),
      /exact candidate commit/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
