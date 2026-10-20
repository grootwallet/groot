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
import { copyHwiRuntime, prepareHwiRuntime, verifyHwiRuntime } from './prepare-hwi-runtime.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const tauriRoot = join(repoRoot, 'src-tauri');
const manifestPath = join(repoRoot, 'docs/hwi-artifact-manifest-3.2.0-mac-arm64.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const buildTarget = process.argv[2] ?? 'mainnet';
const buildIdentity = {
  mainnet: {
    appName: 'Groot Mainnet RC.app',
    productName: 'Groot Mainnet RC',
    identifier: 'app.groot.wallet.mainnet.internal',
    config: 'src-tauri/tauri.mainnet.conf.json',
    outputDirectory: 'mainnet-internal-rc'
  },
  multi: {
    appName: 'Groot RC.app',
    productName: 'Groot RC',
    identifier: 'app.groot.wallet.internal',
    config: 'src-tauri/tauri.multi.conf.json',
    outputDirectory: 'multi-network-internal-rc'
  }
}[buildTarget];
if (!buildIdentity) {
  throw new Error('Internal RC build target must be exactly mainnet or multi');
}
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
const builtApp = join(cargoTarget, 'release', 'bundle', 'macos', buildIdentity.appName);
const outputRoot = resolve(
  process.env.GROOT_INTERNAL_RC_OUT ??
    join(repoRoot, 'release-artifacts', commit, buildIdentity.outputDirectory)
);
const outputApp = join(outputRoot, buildIdentity.appName);
const outputDmg = join(outputRoot, `${buildIdentity.appName.replace(/\.app$/, '')}.dmg`);

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const fail = (message) => {
  throw new Error(`Internal ${buildTarget} RC build failed: ${message}`);
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

  // Internal multi-network RCs only. The native selector additionally limits
  // this payload to Coldcard/Ledger/BitBox02 Testnet4; production keeps HWI.
  const runtime =
    buildTarget === 'multi'
      ? prepareHwiRuntime(
          stagedHwi,
          join(stageDirectory, 'hwi-runtime'),
          manifest.artifact.sha256,
          true
        )
      : null;
  const baseConfig = JSON.parse(readFileSync(join(repoRoot, buildIdentity.config), 'utf8'));

  execFileSync(
    'pnpm',
    [
      'exec',
      'tauri',
      'build',
      '--config',
      JSON.stringify({
        ...baseConfig,
        productName: buildIdentity.productName,
        identifier: buildIdentity.identifier
      }),
      '--bundles',
      'app'
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        GROOT_BUILD_COMMIT: commit,
        GROOT_BUILD_NETWORK: buildTarget,
        GROOT_BUNDLED_HWI_RESOURCE: 'hwi',
        GROOT_HWI_SHA256: manifest.artifact.sha256,
        ...(runtime
          ? { GROOT_HWI_RUNTIME_SHA256: runtime.sha256, GROOT_HWI_SESSION_PROTOCOL: '1' }
          : {}),
        GROOT_MACOS_SIGNING_TEAM_ID: 'REHEARSAL_ONLY'
      },
      stdio: 'inherit'
    }
  );

  if (runtime) {
    // Tauri's resource-file copier dereferences symlinks. Preserve the exact
    // framework layout explicitly, then seal it with the outer app below.
    copyHwiRuntime(
      join(stageDirectory, 'hwi-runtime'),
      join(builtApp, 'Contents', 'Resources', 'hwi-runtime'),
      runtime.sha256,
      manifest.artifact.sha256
    );
  }

  // This private QR rehearsal can request camera access only after a user gesture.
  // Do not inherit HWI entitlements or broaden the production signing workflow.
  const cameraEntitlements = join(tauriRoot, 'Entitlements.camera.plist');
  const cameraPolicy = JSON.parse(
    execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', cameraEntitlements], {
      encoding: 'utf8'
    })
  );
  if (
    Object.keys(cameraPolicy).length !== 1 ||
    cameraPolicy['com.apple.security.device.camera'] !== true
  ) {
    throw new Error('Internal camera entitlement file must contain only camera access');
  }
  execFileSync(
    'codesign',
    ['--force', '--sign', '-', '--timestamp=none', '--entitlements', cameraEntitlements, builtApp],
    {
      stdio: 'inherit'
    }
  );
  const result = verifyPackagedHwi(builtApp, {
    manifestPath,
    requireProductionSigning: false
  });
  validateCompiledTeamId(
    readFileSync(join(builtApp, 'Contents', 'MacOS', 'Groot')),
    'REHEARSAL_ONLY'
  );
  if (runtime) {
    verifyHwiRuntime(
      join(builtApp, 'Contents', 'Resources', 'hwi-runtime'),
      runtime.sha256,
      manifest.artifact.sha256
    );
  }

  mkdirSync(outputRoot, { recursive: true, mode: 0o755 });
  cpSync(builtApp, outputApp, { recursive: true, verbatimSymlinks: true });
  if (runtime) {
    verifyHwiRuntime(
      join(outputApp, 'Contents', 'Resources', 'hwi-runtime'),
      runtime.sha256,
      manifest.artifact.sha256
    );
  }
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', outputApp], {
    stdio: 'pipe'
  });
  execFileSync('node', ['scripts/release/create-macos-dmg.mjs', outputApp, outputDmg, 'Groot'], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  const executable = join(outputApp, 'Contents', 'MacOS', 'Groot');
  const buildInfo = [
    `commit=${commit}`,
    `compiled_network=${buildTarget}`,
    'signing=ad-hoc-internal-only',
    'compiled_signing_requirement=REHEARSAL_ONLY',
    `hwi_version=${result.version}`,
    `hwi_sha256=${result.sha256}`,
    ...(runtime
      ? [
          `coldcard_testnet4_runtime_sha256=${runtime.sha256}`,
          `testnet4_runtime_sha256=${runtime.sha256}`,
          'hwi_session_protocol=1'
        ]
      : []),
    `executable_sha256=${digest(executable)}`,
    ''
  ].join('\n');
  writeFileSync(join(outputRoot, 'BUILD-INFO'), buildInfo, { mode: 0o644 });
  console.log(`Internal ${buildTarget} RC: ${outputApp}`);
  console.log(`Internal ${buildTarget} RC DMG: ${outputDmg}`);
} finally {
  rmSync(stageDirectory, { recursive: true, force: true });
}
