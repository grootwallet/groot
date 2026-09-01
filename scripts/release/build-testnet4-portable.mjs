#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPackagedHwi } from './verify-packaged-hwi.mjs';

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
const cargoTarget = cargoMetadata.target_directory;
// Keep resources outside Cargo's target directory: Tauri may replace that
// directory before it resolves bundle inputs. The ignored staging directory
// preserves the release build's clean-tree gate while the resource exists.
const stageDirectory = join(tauriRoot, '.release-stage');
const stagedHwi = join(stageDirectory, 'hwi');
const app = join(cargoTarget, 'release', 'bundle', 'macos', 'Groot Testnet4.app');
const executable = join(app, 'Contents', 'MacOS', 'Groot');
const sbom = join(cargoTarget, 'release', 'groot-testnet4.cdx.json');

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const fail = (message) => {
  throw new Error(`Testnet4 portable build failed: ${message}`);
};

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  fail('the reviewed HWI artifact is certified only for macOS arm64');
}
const worktreeStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
  cwd: repoRoot,
  encoding: 'utf8'
});
if (worktreeStatus.trim()) fail('package builds require a clean tracked and untracked worktree');
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
    [
      'exec',
      'tauri',
      'build',
      '--config',
      'src-tauri/tauri.testnet4.conf.json',
      '--bundles',
      'app'
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        GROOT_BUILD_NETWORK: 'testnet4',
        GROOT_BUNDLED_HWI_RESOURCE: 'hwi',
        GROOT_HWI_SHA256: manifest.artifact.sha256
      },
      stdio: 'inherit'
    }
  );

  // Local Testnet4 candidates use an ad-hoc app identity. Production releases
  // must supply a Developer ID identity and compile its Team ID requirement.
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', app], {
    stdio: 'inherit'
  });
  const result = verifyPackagedHwi(app, { manifestPath });
  rmSync(sbom, { force: true });
  execFileSync(
    process.execPath,
    [join(repoRoot, 'scripts/release/generate-sbom.mjs'), sbom, executable],
    {
      cwd: repoRoot,
      stdio: 'inherit'
    }
  );
  console.log(`Testnet4 portable app: ${result.app}`);
  console.log(`Testnet4 portable SBOM: ${sbom}`);
} finally {
  rmSync(stageDirectory, { recursive: true, force: true });
}
