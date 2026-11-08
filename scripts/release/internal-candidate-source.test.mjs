import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  assertInternalCandidateSource,
  requireInternalCandidateSource
} from './internal-candidate-source.mjs';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'groot-internal-candidate-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'candidate@example.invalid']);
  git(root, ['config', 'user.name', 'Candidate Test']);
  writeFileSync(join(root, 'wallet.txt'), 'reviewed\n');
  writeFileSync(join(root, 'vite.config.ts'), 'export default {};\n');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'reviewed']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  git(root, ['checkout', '--quiet', '--detach', commit]);
  return { root, commit };
}

function environment(commit, overrides = {}) {
  return {
    GROOT_INTERNAL_CANDIDATE_COMMIT: commit,
    GROOT_INTERNAL_APPROVAL_CONTEXT: 'owner-local',
    ...overrides
  };
}

test('binds a clean detached checkout to its exact commit and complete tracked tree', () => {
  const { root, commit } = fixture();
  try {
    const identity = requireInternalCandidateSource(root, environment(commit));
    assert.equal(identity.candidateCommit, commit);
    assert.equal(identity.sourceTree, git(root, ['rev-parse', 'HEAD^{tree}']));
    assert.match(identity.sourceSnapshotSha256, /^[0-9a-f]{64}$/);
    assert.equal(identity.trackedFileCount, 2);
    assert.deepEqual(assertInternalCandidateSource(root, identity, environment(commit)), identity);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects missing, abbreviated, mismatched and host-inconsistent approval identities', () => {
  const { root, commit } = fixture();
  try {
    for (const env of [
      environment(''),
      environment(commit.slice(0, 12)),
      environment('f'.repeat(40)),
      environment(commit, { GROOT_INTERNAL_APPROVAL_CONTEXT: 'self-declared' }),
      environment(commit, {
        GROOT_INTERNAL_APPROVAL_CONTEXT: 'protected-github-environment'
      }),
      environment(commit, { GITHUB_ACTIONS: 'true' })
    ]) {
      assert.throws(() => requireInternalCandidateSource(root, env));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects branch checkouts plus tracked, untracked and hidden tracked drift', () => {
  const { root, commit } = fixture();
  try {
    git(root, ['switch', '--quiet', '-c', 'candidate']);
    assert.throws(
      () => requireInternalCandidateSource(root, environment(commit)),
      /fresh detached checkout/
    );
    git(root, ['checkout', '--quiet', '--detach', commit]);

    writeFileSync(join(root, 'wallet.txt'), 'changed\n');
    assert.throws(() => requireInternalCandidateSource(root, environment(commit)), /clean/);
    git(root, ['checkout', '--quiet', '--', 'wallet.txt']);

    writeFileSync(join(root, 'untracked.txt'), 'unexpected\n');
    assert.throws(() => requireInternalCandidateSource(root, environment(commit)), /clean/);
    rmSync(join(root, 'untracked.txt'));

    git(root, ['update-index', '--assume-unchanged', 'wallet.txt']);
    writeFileSync(join(root, 'wallet.txt'), 'hidden drift\n');
    assert.throws(
      () => requireInternalCandidateSource(root, environment(commit)),
      /hidden index state|differs from the approved commit/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an approved parent rejects a child commit that changes executable build controls', () => {
  const { root, commit } = fixture();
  try {
    writeFileSync(join(root, 'vite.config.ts'), 'export default { plugins: ["transient"] };\n');
    git(root, ['add', 'vite.config.ts']);
    git(root, ['commit', '--quiet', '-m', 'unreviewed build hook']);
    assert.throws(
      () => requireInternalCandidateSource(root, environment(commit)),
      /does not match the externally accepted commit/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects replacement refs instead of allowing downstream Git calls to resolve them', () => {
  const { root, commit } = fixture();
  try {
    writeFileSync(join(root, 'vite.config.ts'), 'export default { plugins: ["substitute"] };\n');
    git(root, ['add', 'vite.config.ts']);
    git(root, ['commit', '--quiet', '-m', 'unapproved substitute']);
    const substitute = git(root, ['rev-parse', 'HEAD']);
    git(root, ['checkout', '--quiet', '--detach', commit]);
    git(root, ['replace', commit, substitute]);

    assert.throws(
      () => requireInternalCandidateSource(root, environment(commit)),
      /replacement refs/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects inherited Git repository, worktree, index and object substitution variables', () => {
  const approved = fixture();
  const substitute = fixture();
  try {
    for (const override of [
      { GIT_DIR: join(substitute.root, '.git') },
      { GIT_INDEX_FILE: join(substitute.root, '.git', 'index') },
      { GIT_OBJECT_DIRECTORY: join(substitute.root, '.git', 'objects') },
      { GIT_ALTERNATE_OBJECT_DIRECTORIES: join(substitute.root, '.git', 'objects') },
      { GIT_WORK_TREE: substitute.root },
      { GIT_CONFIG: join(substitute.root, '.git', 'config') },
      { GIT_NO_REPLACE_OBJECTS: '0' },
      { GIT_REPLACE_REF_BASE: 'refs/other-replacements/' },
      {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.worktree',
        GIT_CONFIG_VALUE_0: substitute.root
      }
    ]) {
      assert.throws(
        () => requireInternalCandidateSource(approved.root, environment(approved.commit, override)),
        /Git identity environment/
      );
    }
  } finally {
    rmSync(approved.root, { recursive: true, force: true });
    rmSync(substitute.root, { recursive: true, force: true });
  }
});

test('rejects inherited frontend variables that override reviewed Vite mode files', () => {
  const { root, commit } = fixture();
  try {
    for (const override of [
      { PUBLIC_BITCOIN_NETWORK: 'mainnet' },
      { VITE_UNREVIEWED_BUILD_FLAG: 'true' }
    ]) {
      assert.throws(
        () => requireInternalCandidateSource(root, environment(commit, override)),
        /frontend environment override/
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects on-disk Git object alternates', () => {
  const approved = fixture();
  const substitute = fixture();
  try {
    const alternatesPath = git(approved.root, [
      'rev-parse',
      '--git-path',
      'objects/info/alternates'
    ]);
    writeFileSync(
      resolve(approved.root, alternatesPath),
      `${join(substitute.root, '.git', 'objects')}\n`
    );
    assert.throws(
      () => requireInternalCandidateSource(approved.root, environment(approved.commit)),
      /object alternates/
    );
  } finally {
    rmSync(approved.root, { recursive: true, force: true });
    rmSync(substitute.root, { recursive: true, force: true });
  }
});

test('rejects ignored Vite environment files that can alter packaged configuration', () => {
  const { root } = fixture();
  try {
    writeFileSync(join(root, '.gitignore'), '.env*\n');
    writeFileSync(join(root, '.env.testnet4'), 'PUBLIC_BITCOIN_NETWORK=testnet4\n');
    git(root, ['add', '.gitignore']);
    git(root, ['add', '--force', '.env.testnet4']);
    git(root, ['commit', '--quiet', '-m', 'ignore local Vite environment']);
    const approvedCommit = git(root, ['rev-parse', 'HEAD']);
    git(root, ['checkout', '--quiet', '--detach', approvedCommit]);
    assert.doesNotThrow(() => requireInternalCandidateSource(root, environment(approvedCommit)));
    for (const relativePath of [
      '.env.testnet4.local',
      '.env.mainnet.local',
      '.env.multi.local',
      '.ENV.TESTNET4.LOCAL'
    ]) {
      writeFileSync(join(root, relativePath), 'PUBLIC_BITCOIN_NETWORK=mainnet\n');
      assert.throws(
        () => requireInternalCandidateSource(root, environment(approvedCommit)),
        /untracked Vite environment file/
      );
      rmSync(join(root, relativePath));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  'rejects tracked symlinks whose ignored targets can change packaged configuration',
  { skip: process.platform === 'win32' },
  () => {
    const { root } = fixture();
    try {
      mkdirSync(join(root, 'runtime'));
      writeFileSync(join(root, 'runtime', 'vite.env'), 'PUBLIC_BITCOIN_NETWORK=testnet4\n');
      writeFileSync(join(root, '.gitignore'), 'runtime/\n');
      symlinkSync('runtime/vite.env', join(root, '.env.testnet4'));
      git(root, ['add', '.gitignore', '.env.testnet4']);
      git(root, ['commit', '--quiet', '-m', 'tracked Vite environment symlink']);
      const commit = git(root, ['rev-parse', 'HEAD']);
      git(root, ['checkout', '--quiet', '--detach', commit]);

      assert.throws(
        () => requireInternalCandidateSource(root, environment(commit)),
        /tracked symlinks/
      );
      writeFileSync(join(root, 'runtime', 'vite.env'), 'PUBLIC_BITCOIN_NETWORK=mainnet\n');
      assert.throws(
        () => requireInternalCandidateSource(root, environment(commit)),
        /tracked symlinks/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);

test('rejects a loose approved commit object whose bytes do not match its object ID', () => {
  const { root, commit } = fixture();
  try {
    writeFileSync(join(root, 'wallet.txt'), 'unapproved runtime code\n');
    git(root, ['add', 'wallet.txt']);
    git(root, ['commit', '--quiet', '-m', 'unapproved source']);
    const substitute = git(root, ['rev-parse', 'HEAD']);
    const rawSubstituteCommit = execFileSync('git', ['cat-file', 'commit', substitute], {
      cwd: root
    });
    git(root, ['checkout', '--quiet', '--detach', commit]);

    const looseApprovedObject = join(root, '.git', 'objects', commit.slice(0, 2), commit.slice(2));
    const forgedObject = Buffer.concat([
      Buffer.from(`commit ${rawSubstituteCommit.length}\0`, 'utf8'),
      rawSubstituteCommit
    ]);
    chmodSync(looseApprovedObject, 0o644);
    writeFileSync(looseApprovedObject, deflateSync(forgedObject));
    git(root, ['reset', '--quiet', '--hard', commit]);
    assert.equal(readFileSync(join(root, 'wallet.txt'), 'utf8'), 'unapproved runtime code\n');

    assert.throws(
      () => requireInternalCandidateSource(root, environment(commit)),
      /object graph failed integrity verification/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
