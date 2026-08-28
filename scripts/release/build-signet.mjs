#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const tauriRoot = join(repoRoot, 'src-tauri');
const executable = join(
  tauriRoot,
  'target',
  'release',
  process.platform === 'win32' ? 'Groot.exe' : 'Groot'
);
const sbom = join(tauriRoot, 'target', 'release', 'groot-signet.cdx.json');
const worktreeStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
  cwd: repoRoot,
  encoding: 'utf8'
});
if (worktreeStatus.trim()) {
  throw new Error('Signet package builds require a clean tracked and untracked worktree.');
}

execFileSync('pnpm', ['exec', 'tauri', 'build', '--config', 'src-tauri/tauri.signet.conf.json'], {
  cwd: repoRoot,
  env: { ...process.env, GROOT_BUILD_NETWORK: 'signet' },
  stdio: 'inherit'
});
rmSync(sbom, { force: true });
execFileSync(
  process.execPath,
  [join(repoRoot, 'scripts/release/generate-sbom.mjs'), sbom, executable],
  {
    cwd: repoRoot,
    stdio: 'inherit'
  }
);
console.log(`Signet package SBOM: ${sbom}`);
