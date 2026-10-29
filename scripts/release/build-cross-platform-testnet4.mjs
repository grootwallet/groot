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
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHwiRuntime, verifyHwiRuntime } from './prepare-hwi-runtime.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const tauriRoot = join(repoRoot, 'src-tauri');
const platform =
  process.platform === 'linux' && process.arch === 'x64'
    ? 'linux-x86_64'
    : process.platform === 'win32' && process.arch === 'x64'
      ? 'windows-x86_64'
      : null;
if (!platform)
  throw new Error('Cross-platform Testnet4 packages require native Linux or Windows x86_64');

const manifestPath = join(repoRoot, `docs/hwi-artifact-manifest-3.2.0-${platform}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const source = resolve(process.env.GROOT_HWI_SOURCE ?? '');
const sourceArchive = resolve(process.env.GROOT_HWI_SOURCE_ARCHIVE ?? '');
const license = resolve(process.env.GROOT_HWI_LICENSE ?? '');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8'
}).trim();
const target = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', 'src-tauri/Cargo.toml'],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  )
).target_directory;
const outputRoot = resolve(
  process.env.GROOT_CROSS_PLATFORM_OUT ?? join(repoRoot, 'release-artifacts', commit, platform)
);
const stage = join(tauriRoot, '.release-stage');
const resourceName = process.platform === 'win32' ? 'hwi.exe' : 'hwi';
const stagedHwi = join(stage, resourceName);
const stagedRuntime = join(stage, 'hwi-runtime');
const bundles = process.platform === 'win32' ? ['msi', 'nsis'] : ['deb'];
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const requireRegular = (path, maximum) => {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size <= 0 ||
    metadata.size > maximum
  ) {
    throw new Error(`Invalid bounded release input: ${basename(path)}`);
  }
};

for (const [path, maximum] of [
  [source, 512 * 1024 * 1024],
  [sourceArchive, 2 * 1024 * 1024 * 1024],
  [license, 1024 * 1024]
])
  requireRegular(path, maximum);

if (
  execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim()
) {
  throw new Error(
    'Cross-platform package builds require a clean tracked and untracked source checkout'
  );
}
if (existsSync(outputRoot)) throw new Error(`Output already exists: ${outputRoot}`);
execFileSync(
  process.execPath,
  [
    join(repoRoot, 'scripts/release/verify-hwi-artifact.mjs'),
    manifestPath,
    source,
    sourceArchive,
    license
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit'
  }
);

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true, mode: 0o755 });
try {
  copyFileSync(source, stagedHwi);
  if (process.platform !== 'win32') chmodSync(stagedHwi, 0o755);
  if (digest(stagedHwi) !== manifest.artifact.sha256) throw new Error('Staged HWI digest changed');
  const runtime = prepareHwiRuntime(stagedHwi, stagedRuntime, manifest.artifact.sha256, true);
  verifyHwiRuntime(stagedRuntime, runtime.sha256, manifest.artifact.sha256);

  for (const deviceType of ['coldcard', 'ledger', 'bitbox02', 'trezor', 'jade']) {
    const probe = `${JSON.stringify({
      version: 1,
      chain: 'testnet4',
      deviceType,
      devicePath: 'build-time-driver-probe',
      accountPath: "m/84'/1'/0'",
      expected: [],
      action: 'probe',
      value: null
    })}\n`;
    const helper = join(
      stagedRuntime,
      process.platform === 'win32' ? 'groot-hwi-session.exe' : 'groot-hwi-session'
    );
    const response = JSON.parse(
      execFileSync(helper, ['--stdin'], { input: probe, encoding: 'utf8', timeout: 30_000 })
    );
    if (response.probe !== 'groot-hwi-session-v1' || response.vendor !== '3.2.0') {
      throw new Error(`Unpacked ${deviceType} driver probe failed`);
    }
  }

  const baseConfig = JSON.parse(readFileSync(join(tauriRoot, 'tauri.testnet4.conf.json'), 'utf8'));
  const config = {
    ...baseConfig,
    productName: 'Groot 5.4 Testnet4',
    identifier: 'app.groot.wallet.testnet4.internal54',
    bundle: {
      ...(baseConfig.bundle ?? {}),
      resources: {
        [`.release-stage/${resourceName}`]: resourceName,
        '.release-stage/hwi-runtime': 'hwi-runtime'
      }
    }
  };
  execFileSync(
    'pnpm',
    ['exec', 'tauri', 'build', '--config', JSON.stringify(config), '--bundles', bundles.join(',')],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        GROOT_BUILD_COMMIT: commit,
        GROOT_BUILD_NETWORK: 'testnet4',
        GROOT_BUNDLED_HWI_RESOURCE: resourceName,
        GROOT_HWI_SHA256: manifest.artifact.sha256,
        GROOT_HWI_RUNTIME_SHA256: runtime.sha256,
        GROOT_HWI_SESSION_PROTOCOL: '1',
        GROOT_DESKTOP_CANDIDATE_PLATFORM: platform
      },
      stdio: 'inherit'
    }
  );

  mkdirSync(outputRoot, { recursive: true, mode: 0o755 });
  const extensions = process.platform === 'win32' ? ['.msi', '.exe'] : ['.deb'];
  const collect = (directory) => {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? collect(path)
        : extensions.some((extension) => entry.name.endsWith(extension))
          ? [path]
          : [];
    });
  };
  const packages = collect(join(target, 'release', 'bundle'));
  if (packages.length !== extensions.length) {
    throw new Error(
      `Expected ${extensions.join(' and ')} packages; found ${packages.map(basename).join(', ')}`
    );
  }
  for (const packagePath of packages) cpSync(packagePath, join(outputRoot, basename(packagePath)));
  const executable = join(target, 'release', process.platform === 'win32' ? 'Groot.exe' : 'Groot');
  execFileSync(
    process.execPath,
    [
      join(repoRoot, 'scripts/release/generate-sbom.mjs'),
      join(outputRoot, 'groot-5.4.0-rc01.cdx.json'),
      executable
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit'
    }
  );
  const buildInfo = [
    `commit=${commit}`,
    'version=5.4.0-rc01',
    'compiled_network=testnet4',
    `platform=${platform}`,
    'signing=unsigned-internal-owner-test',
    'public_release_authorized=false',
    'hwi_version=3.2.0',
    `hwi_sha256=${manifest.artifact.sha256}`,
    `hwi_runtime_sha256=${runtime.sha256}`,
    'hwi_session_protocol=1',
    `executable_sha256=${digest(executable)}`,
    ''
  ].join('\n');
  writeFileSync(join(outputRoot, 'BUILD-INFO'), buildInfo);
  copyFileSync(manifestPath, join(outputRoot, basename(manifestPath)));
  copyFileSync(
    join(repoRoot, 'docs/testing/5.4.0-cross-platform-hardware.md'),
    join(outputRoot, 'TESTING.md')
  );
  const evidenceFiles = readdirSync(outputRoot).sort();
  writeFileSync(
    join(outputRoot, 'SHA256SUMS'),
    evidenceFiles.map((name) => `${digest(join(outputRoot, name))}  ${name}`).join('\n') + '\n'
  );
  console.log(`Cross-platform Testnet4 packages: ${outputRoot}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
