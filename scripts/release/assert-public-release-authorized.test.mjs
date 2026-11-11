import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyPublicReleaseAuthorization } from './assert-public-release-authorized.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';

function writeVersionChecklist(
  root,
  { version = '0.5.0', tag = `v${version}`, decision = 'BLOCKED', open = true } = {}
) {
  writeFileSync(
    join(root, `docs/mainnet-release-checklist-${version}.md`),
    `# ${tag} public release checklist\n\nRelease version: ${version}\nRelease tag: ${tag}\nRelease decision: ${decision}\n\n- [${open ? ' ' : 'x'}] Evidence ${open ? 'remains open' : 'is complete'}.\n`
  );
}

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

test('the public approval binds exact v5.3.0 and rejects prereleases and other versions', () => {
  const root = fixture();
  try {
    for (const file of ['mainnet-release-authorization.json', 'mainnet-release-checklist.md'])
      cpSync(new URL(`../../docs/${file}`, import.meta.url), join(root, 'docs', file));
    cpSync(
      new URL('../../docs/adr/0105-authorize-5-3-0-release-campaign.md', import.meta.url),
      join(root, 'docs/adr/0105-authorize-5-3-0-release-campaign.md')
    );
    writeFileSync(join(root, 'package.json'), '{"version":"5.3.0"}\n');
    assert.doesNotThrow(() => verifyPublicReleaseAuthorization({ repoRoot: root, commit }));
    for (const version of ['5.2.0', '5.3.0-rc18', '5.3.1']) {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
      assert.throws(
        () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
        /package version is invalid|authorization does not name the package version/
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('approval must bind the package version, release tag, accepted ADR, and closed checklist', () => {
  const root = fixture({ status: 'approved', decisionAdr: '0082' });
  try {
    writeVersionChecklist(root, { decision: 'APPROVED', open: false });
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

test('a future release cannot reuse the historical canonical checklist', () => {
  const root = fixture({
    status: 'approved',
    authorizedVersion: '0.5.4',
    authorizedTag: 'v0.5.4',
    decisionAdr: '0110'
  });
  try {
    writeFileSync(join(root, 'package.json'), '{"version":"0.5.4"}\n');
    writeFileSync(
      join(root, 'docs/mainnet-release-checklist.md'),
      '# Historical checklist\n\nRelease decision: APPROVED\n\n- [x] Historical evidence complete.\n'
    );
    writeFileSync(
      join(root, 'docs/adr/0110-authorize-mainnet.md'),
      '# ADR 0110\n\n- Status: accepted\n\nAuthorizes: public Mainnet distribution for version 0.5.4 when annotated tag v0.5.4 and origin/main resolve to the same commit\n'
    );
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /version-specific release checklist is missing/
    );

    writeVersionChecklist(root, { version: '0.5.4', decision: 'PENDING' });
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /version-specific release checklist is not approved/
    );

    writeVersionChecklist(root, { version: '0.5.4', decision: 'APPROVED' });
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /version-specific release checklist still has open items/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a version-specific checklist must name the exact package version and tag', () => {
  const root = fixture({ status: 'approved', decisionAdr: '0082' });
  try {
    writeFileSync(
      join(root, 'docs/adr/0082-authorize-mainnet.md'),
      '# ADR 0082\n\n- Status: accepted\n\nAuthorizes: public Mainnet distribution for version 0.5.0 when annotated tag v0.5.0 and origin/main resolve to the same commit\n'
    );
    writeVersionChecklist(root, {
      version: '0.5.0',
      tag: 'v0.5.1',
      decision: 'APPROVED',
      open: false
    });
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /does not name the release tag/
    );

    writeVersionChecklist(root, { version: '0.5.0', decision: 'APPROVED', open: false });
    const checklistPath = join(root, 'docs/mainnet-release-checklist-0.5.0.md');
    writeFileSync(
      checklistPath,
      '# v0.5.0 public release checklist\n\nRelease version: 0.5.1\nRelease tag: v0.5.0\nRelease decision: APPROVED\n\n- [x] Evidence is complete.\n'
    );
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /does not name the release version/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('authorization rejects a tag that does not exactly match the package version', () => {
  const root = fixture({ status: 'approved', authorizedTag: 'v0.5.0-rc1', decisionAdr: '0082' });
  try {
    writeVersionChecklist(root, { decision: 'APPROVED', open: false });
    assert.throws(
      () => verifyPublicReleaseAuthorization({ repoRoot: root, commit }),
      /does not name the release tag/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
