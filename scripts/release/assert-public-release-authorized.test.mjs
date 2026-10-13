import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyPublicReleaseAuthorization } from './assert-public-release-authorized.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';

function fixture({
  status = 'blocked',
  authorizedVersion = '0.5.0',
  authorizedTag = 'v0.5.0',
  decisionAdr = null
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'groot-release-authorization-'));
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"version":"0.5.0"}\n');
  writeFileSync(
    join(root, 'docs/mainnet-release-authorization.json'),
    `${JSON.stringify(
      { schemaVersion: 2, status, authorizedVersion, authorizedTag, decisionAdr },
      null,
      2
    )}\n`
  );
  writeFileSync(
    join(root, 'docs/mainnet-release-checklist.md'),
    '# Mainnet release checklist\n\nRelease decision: BLOCKED\n\n- [ ] Evidence remains open.\n'
  );
  return root;
}

test('a blocked authorization cannot be used for public packaging', () => {
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

test('the repository authorizes the v0.5.1 release tag', () => {
  assert.doesNotThrow(() =>
    verifyPublicReleaseAuthorization({
      commit
    })
  );
});

test('approval must bind the package version, release tag, accepted ADR, and closed checklist', () => {
  const root = fixture({ status: 'approved', decisionAdr: '0082' });
  try {
    writeFileSync(
      join(root, 'docs/mainnet-release-checklist.md'),
      '# Mainnet release checklist\n\nRelease decision: APPROVED\n\n- [x] Evidence complete.\n'
    );
    writeFileSync(
      join(root, 'docs/adr/0082-authorize-mainnet.md'),
      '# ADR 0082\n\n- Status: accepted\n\nAuthorizes: public Mainnet distribution for version 0.5.0 when annotated tag v0.5.0 and origin/main resolve to the same commit\n'
    );
    assert.doesNotThrow(() => verifyPublicReleaseAuthorization({ repoRoot: root, commit }));
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit: 'bad' }),
      /invalid/
    );

    writeFileSync(join(root, 'package.json'), '{"version":"0.5.1"}\n');
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /does not name the package version/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('authorization rejects a tag that does not exactly match the package version', () => {
  const root = fixture({ status: 'approved', authorizedTag: 'v0.5.0-rc1', decisionAdr: '0082' });
  try {
    writeFileSync(
      join(root, 'docs/mainnet-release-checklist.md'),
      '# Mainnet release checklist\n\nRelease decision: APPROVED\n\n- [x] Evidence complete.\n'
    );
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /does not name the release tag/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
