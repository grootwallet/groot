import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const fullCommitPattern = /^[0-9a-f]{40}$/;
const approvalContexts = new Set(['owner-local', 'protected-github-environment']);
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
const harmlessGitEnvironment = new Set(['GIT_PAGER']);

function sanitizedGitEnvironment(environment) {
  const sanitized = { ...process.env, ...environment };
  for (const key of Object.keys(sanitized)) {
    if (key.toUpperCase().startsWith('GIT_')) delete sanitized[key];
  }
  return {
    ...sanitized,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0'
  };
}

function gitGlobalOptionsFor(repoRoot) {
  return [
    '--no-replace-objects',
    `--work-tree=${repoRoot}`,
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
    '-c',
    'core.preloadIndex=false',
    '-c',
    `core.excludesFile=${nullDevice}`
  ];
}

function rejectGitIdentityEnvironment(environment) {
  const inherited = { ...process.env, ...environment };
  const unsafe = Object.keys(inherited).find((key) => {
    const normalized = key.toUpperCase();
    return normalized.startsWith('GIT_') && !harmlessGitEnvironment.has(normalized);
  });
  if (unsafe) {
    throw new Error(`Internal candidate builds reject Git identity environment: ${unsafe}`);
  }
}

function rejectFrontendEnvironment(environment) {
  const inherited = { ...process.env, ...environment };
  const unsafe = Object.keys(inherited).find((key) => {
    const normalized = key.toUpperCase();
    return normalized.startsWith('PUBLIC_') || normalized.startsWith('VITE_');
  });
  if (unsafe) {
    throw new Error(`Internal candidate builds reject frontend environment override: ${unsafe}`);
  }
}

function git(repoRoot, args, environment, options = {}) {
  return execFileSync('git', [...gitGlobalOptionsFor(repoRoot), ...args], {
    cwd: repoRoot,
    env: sanitizedGitEnvironment(environment),
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
}

function requireDetachedHead(repoRoot, environment) {
  const branch = spawnSync(
    'git',
    [...gitGlobalOptionsFor(repoRoot), 'symbolic-ref', '-q', 'HEAD'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: sanitizedGitEnvironment(environment)
    }
  );
  if (branch.error) throw branch.error;
  if (branch.status === 0) {
    throw new Error('Internal candidate builds require a fresh detached checkout');
  }
  if (branch.status !== 1) {
    throw new Error('Unable to verify detached internal candidate checkout');
  }
}

function rejectGitObjectSubstitution(repoRoot, environment) {
  const replacementRefs = git(
    repoRoot,
    ['for-each-ref', '--format=%(refname)', 'refs/replace'],
    environment,
    { encoding: 'utf8' }
  ).trim();
  if (replacementRefs) {
    throw new Error('Internal candidate builds reject Git replacement refs');
  }
  const alternatesPath = git(
    repoRoot,
    ['rev-parse', '--git-path', 'objects/info/alternates'],
    environment,
    { encoding: 'utf8' }
  ).trim();
  const absoluteAlternatesPath = resolve(repoRoot, alternatesPath);
  if (existsSync(absoluteAlternatesPath) && readFileSync(absoluteAlternatesPath, 'utf8').trim()) {
    throw new Error('Internal candidate builds reject Git object alternates');
  }
}

function verifyGitObjectGraph(repoRoot, candidateCommit, environment) {
  try {
    git(
      repoRoot,
      ['fsck', '--strict', '--full', '--no-dangling', '--no-reflogs', candidateCommit],
      environment,
      { stdio: 'pipe' }
    );
  } catch {
    throw new Error('Internal candidate Git object graph failed integrity verification');
  }
}

function commitTree(repoRoot, candidateCommit, environment) {
  const objectType = git(repoRoot, ['cat-file', '-t', candidateCommit], environment, {
    encoding: 'utf8'
  }).trim();
  if (objectType !== 'commit') {
    throw new Error('The externally accepted internal candidate is not a commit object');
  }
  const commit = git(repoRoot, ['cat-file', 'commit', candidateCommit], environment, {
    encoding: 'utf8'
  });
  const tree = /^tree ([0-9a-f]+)$/m.exec(commit)?.[1];
  if (!tree) throw new Error('Unable to read the approved internal candidate tree');
  return tree;
}

function trackedEntries(repoRoot, objectFormat, sourceTree, environment) {
  const output = git(repoRoot, ['ls-tree', '-rz', '--full-tree', sourceTree], environment);
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const match = /^(\d+) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error('Unable to parse tracked internal candidate source');
      const [, mode, type, expectedObject, relativePath] = match;
      if (type !== 'blob' || mode === '160000') {
        throw new Error(`Internal candidate builds reject submodules: ${relativePath}`);
      }
      if (mode === '120000') {
        throw new Error(`Internal candidate builds reject tracked symlinks: ${relativePath}`);
      }
      const absolutePath = resolve(repoRoot, relativePath);
      if (absolutePath !== repoRoot && !absolutePath.startsWith(`${repoRoot}${sep}`)) {
        throw new Error('Tracked internal candidate path escaped the checkout');
      }
      const metadata = lstatSync(absolutePath);
      if (!metadata.isFile()) {
        throw new Error(`Tracked internal candidate source is not a file: ${relativePath}`);
      }
      const bytes = readFileSync(absolutePath);
      const actualObject = createHash(objectFormat)
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      if (actualObject !== expectedObject) {
        throw new Error(
          `Tracked internal candidate source differs from the approved commit: ${relativePath}`
        );
      }
      return { mode, relativePath, object: actualObject };
    });
}

function rejectUntrackedViteEnvironmentFiles(repoRoot, entries) {
  const trackedPaths = new Set(entries.map((entry) => entry.relativePath));
  for (const relativePath of readdirSync(repoRoot)) {
    const normalizedPath = relativePath.toLowerCase();
    if (normalizedPath !== '.env' && !normalizedPath.startsWith('.env.')) continue;
    if (trackedPaths.has(relativePath)) continue;
    throw new Error(
      `Internal candidate checkout contains an untracked Vite environment file: ${relativePath}`
    );
  }
}

function readSourceIdentity(repoRoot, environment) {
  const candidateCommit = environment.GROOT_INTERNAL_CANDIDATE_COMMIT ?? '';
  if (!fullCommitPattern.test(candidateCommit)) {
    throw new Error('GROOT_INTERNAL_CANDIDATE_COMMIT must be one full lowercase commit SHA');
  }
  const approvalContext = environment.GROOT_INTERNAL_APPROVAL_CONTEXT ?? '';
  if (!approvalContexts.has(approvalContext)) {
    throw new Error(
      'GROOT_INTERNAL_APPROVAL_CONTEXT must be owner-local or protected-github-environment'
    );
  }
  if (
    (approvalContext === 'protected-github-environment') !==
    (environment.GITHUB_ACTIONS === 'true')
  ) {
    throw new Error('Internal candidate approval context does not match the build host');
  }

  rejectGitIdentityEnvironment(environment);
  rejectFrontendEnvironment(environment);
  rejectGitObjectSubstitution(repoRoot, environment);
  requireDetachedHead(repoRoot, environment);
  verifyGitObjectGraph(repoRoot, candidateCommit, environment);
  const head = git(repoRoot, ['rev-parse', '--verify', 'HEAD'], environment, {
    encoding: 'utf8'
  }).trim();
  if (head !== candidateCommit) {
    throw new Error('Internal candidate checkout does not match the externally accepted commit');
  }
  const sourceTree = commitTree(repoRoot, candidateCommit, environment);
  const status = git(
    repoRoot,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    environment
  );
  if (status.length !== 0) {
    throw new Error('Internal candidate builds require a clean tracked and untracked checkout');
  }
  const indexFlags = git(repoRoot, ['ls-files', '-v', '-z'], environment)
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const unsafeIndexFlag = indexFlags.find((entry) => entry[0] !== 'H');
  if (unsafeIndexFlag) {
    throw new Error(
      `Internal candidate checkout has hidden index state: ${unsafeIndexFlag.slice(2)}`
    );
  }

  const objectFormat = git(repoRoot, ['rev-parse', '--show-object-format'], environment, {
    encoding: 'utf8'
  }).trim();
  if (!['sha1', 'sha256'].includes(objectFormat)) {
    throw new Error(`Unsupported Git object format: ${objectFormat}`);
  }
  const entries = trackedEntries(repoRoot, objectFormat, sourceTree, environment);
  rejectUntrackedViteEnvironmentFiles(repoRoot, entries);
  const sourceSnapshotSha256 = createHash('sha256');
  for (const entry of entries) {
    sourceSnapshotSha256.update(entry.mode);
    sourceSnapshotSha256.update('\0');
    sourceSnapshotSha256.update(entry.relativePath);
    sourceSnapshotSha256.update('\0');
    sourceSnapshotSha256.update(entry.object);
    sourceSnapshotSha256.update('\0');
  }

  return {
    approvalContext,
    candidateCommit,
    sourceTree,
    sourceSnapshotSha256: sourceSnapshotSha256.digest('hex'),
    trackedFileCount: entries.length
  };
}

export function requireInternalCandidateSource(repoRoot, environment = process.env) {
  return readSourceIdentity(resolve(repoRoot), environment);
}

export function assertInternalCandidateSource(repoRoot, expected, environment = process.env) {
  const actual = readSourceIdentity(resolve(repoRoot), environment);
  for (const key of [
    'approvalContext',
    'candidateCommit',
    'sourceTree',
    'sourceSnapshotSha256',
    'trackedFileCount'
  ]) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Internal candidate source identity changed during the build: ${key}`);
    }
  }
  return actual;
}
