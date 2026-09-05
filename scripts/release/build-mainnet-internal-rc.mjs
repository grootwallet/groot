#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCompiledTeamId, verifyPackagedHwi } from './verify-packaged-hwi.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const tauriRoot = join(repoRoot, 'src-tauri');
const manifestPath = join(repoRoot, 'docs/hwi-artifact-manifest-3.2.0-mac-arm64.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const source = resolve(process.env.GROOT_HWI_SOURCE ?? '/opt/homebrew/bin/hwi');
const cargoMetadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', 'src-tauri/Cargo.toml'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8'
}).trim();
const cargoTarget = cargoMetadata.target_directory;
const stageDirectory = join(tauriRoot, '.release-stage');
const stagedHwi = join(stageDirectory, 'hwi');
const builtApp = join(cargoTarget, 'release', 'bundle', 'macos', 'Groot Mainnet.app');
const outputRoot = resolve(
  process.env.GROOT_INTERNAL_RC_OUT ??
    join(repoRoot, 'release-artifacts', commit, 'mainnet-internal-rc')
);
const outputApp = join(outputRoot, 'Groot Mainnet.app');

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const fail = (message) => {
  throw new Error(`Internal mainnet RC build failed: ${message}`);
};

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  fail('the internal mainnet RC is restricted to macOS Apple silicon');
}
const worktreeStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
  cwd: repoRoot,
  encoding: 'utf8'
});
if (worktreeStatus.trim())
  fail('internal RC builds require a clean tracked and untracked worktree');
if (existsSync(outputRoot)) fail(`output already exists: ${outputRoot}`);
const sourceLink = lstatSync(source);
if (sourceLink.isSymbolicLink() || !sourceLink.isFile()) fail('HWI source must be a regular file');
if ((statSync(source).mode & 0o111) === 0) fail('HWI source is not executable');
if (digest(source) !== manifest.artifact.sha256) fail('HWI source digest does not match manifest');
const sourceVersion = execFileSync(source, ['--version'], {
  encoding: 'utf8',
  env: { HOME: process.env.HOME ?? '/var/empty' },
  timeout: 30_000
}).trim();
if (sourceVersion !== `hwi ${manifest.version}`) fail(`unexpected HWI version: ${sourceVersion}`);
execFileSync('codesign', ['--verify', '--strict', '--verbose=2', source], { stdio: 'pipe' });

rmSync(stageDirectory, { recursive: true, force: true });
mkdirSync(stageDirectory, { recursive: true, mode: 0o755 });
try {
  copyFileSync(source, stagedHwi);
  chmodSync(stagedHwi, 0o755);
  if (digest(stagedHwi) !== manifest.artifact.sha256) fail('staged HWI changed during copy');

  execFileSync(
    'pnpm',
    ['exec', 'tauri', 'build', '--config', 'src-tauri/tauri.mainnet.conf.json', '--bundles', 'app'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        GROOT_BUILD_COMMIT: commit,
        GROOT_BUILD_NETWORK: 'mainnet',
        GROOT_BUNDLED_HWI_RESOURCE: 'hwi',
        GROOT_HWI_SHA256: manifest.artifact.sha256,
        GROOT_MACOS_SIGNING_TEAM_ID: 'REHEARSAL_ONLY'
      },
      stdio: 'inherit'
    }
  );

  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', builtApp], {
    stdio: 'inherit'
  });
  const result = verifyPackagedHwi(builtApp, {
    manifestPath,
    requireProductionSigning: false
  });
  validateCompiledTeamId(
    readFileSync(join(builtApp, 'Contents', 'MacOS', 'Groot')),
    'REHEARSAL_ONLY'
  );

  mkdirSync(outputRoot, { recursive: true, mode: 0o755 });
  cpSync(builtApp, outputApp, { recursive: true });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', outputApp], {
    stdio: 'pipe'
  });
  const executable = join(outputApp, 'Contents', 'MacOS', 'Groot');
  const buildInfo = [
    `commit=${commit}`,
    'compiled_network=mainnet',
    'signing=ad-hoc-internal-only',
    'compiled_signing_requirement=REHEARSAL_ONLY',
    `hwi_version=${result.version}`,
    `hwi_sha256=${result.sha256}`,
    `executable_sha256=${digest(executable)}`,
    ''
  ].join('\n');
  writeFileSync(join(outputRoot, 'BUILD-INFO'), buildInfo, { mode: 0o644 });
  console.log(`Internal mainnet RC: ${outputApp}`);
} finally {
  rmSync(stageDirectory, { recursive: true, force: true });
}
