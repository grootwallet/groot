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
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPackagedHwi } from './verify-packaged-hwi.mjs';
import { verifySignedHwiArtifact } from './verify-signed-hwi.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const packageMetadata = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const expectedEvidence = ['BUILD-INFO', 'Groot', 'SHA256SUMS', 'groot.cdx.json'];

function fail(message) {
  throw new Error(`Production macOS package failed: ${message}`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(command, arguments_, options = {}) {
  return execFileSync(command, arguments_, {
    cwd: repoRoot,
    encoding: options.encoding,
    env: options.env ?? process.env,
    stdio: options.encoding ? 'pipe' : 'inherit',
    timeout: options.timeout
  });
}

function requireRegular(path, label, { executable = false } = {}) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size <= 0) {
    fail(`${label} must be a nonempty regular file`);
  }
  if (executable && (statSync(path).mode & 0o111) === 0) fail(`${label} is not executable`);
}

function parseBuildInfo(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator <= 0) fail('BUILD-INFO contains an invalid line');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function submitForNotarization(path, profile) {
  const response = run(
    'xcrun',
    [
      'notarytool',
      'submit',
      path,
      '--keychain-profile',
      profile,
      '--wait',
      '--output-format',
      'json'
    ],
    { encoding: 'utf8', timeout: 30 * 60 * 1000 }
  );
  const result = JSON.parse(response);
  if (result.status !== 'Accepted' || !result.id) fail(`notarization was not accepted for ${path}`);
  return { id: result.id, status: result.status };
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  fail('packaging requires macOS Apple silicon');
}
const [evidenceArgument, hwiArgument, hwiManifestArgument, outputArgument] = process.argv.slice(2);
if (
  [evidenceArgument, hwiArgument, hwiManifestArgument, outputArgument].some(
    (value) => !value || !isAbsolute(value)
  )
) {
  fail(
    'usage: package-macos-ga.mjs /absolute/evidence /absolute/hwi /absolute/signed-hwi-manifest.json /new/absolute/output'
  );
}
const identity = process.env.GROOT_MACOS_SIGNING_IDENTITY;
const teamId = process.env.GROOT_MACOS_SIGNING_TEAM_ID;
const notaryProfile = process.env.GROOT_MACOS_NOTARY_PROFILE;
if (!identity) fail('set GROOT_MACOS_SIGNING_IDENTITY');
if (!/^[A-Z0-9]{10}$/.test(teamId ?? '')) fail('set the reviewed 10-character team');
if (!notaryProfile) fail('set GROOT_MACOS_NOTARY_PROFILE to an existing Keychain profile');
if (!isAbsolute(process.env.CARGO_TARGET_DIR ?? '')) {
  fail('set CARGO_TARGET_DIR to a fresh absolute packaging target');
}

const evidence = resolve(evidenceArgument);
const signedHwi = resolve(hwiArgument);
const signedHwiManifest = resolve(hwiManifestArgument);
const output = resolve(outputArgument);
if (existsSync(output)) fail(`output already exists: ${output}`);
if (!lstatSync(evidence).isDirectory() || lstatSync(evidence).isSymbolicLink()) {
  fail('evidence directory is invalid');
}
const evidenceEntries = readdirSync(evidence).sort();
if (JSON.stringify(evidenceEntries) !== JSON.stringify(expectedEvidence)) {
  fail('evidence directory does not have the exact four-file shape');
}
for (const name of expectedEvidence) requireRegular(join(evidence, name), `evidence ${name}`);
const recordedSums = readFileSync(join(evidence, 'SHA256SUMS'), 'utf8');
const expectedSums = `\
${digest(join(evidence, 'Groot'))}  Groot\n\
${digest(join(evidence, 'groot.cdx.json'))}  groot.cdx.json\n`;
if (recordedSums !== expectedSums) fail('evidence checksum manifest is invalid');

const commit = run('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const remoteMainResult = run('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
  encoding: 'utf8'
}).trim();
const remoteMainMatch = remoteMainResult.match(/^([0-9a-f]{40})\s+refs\/heads\/main$/);
if (!remoteMainMatch || commit !== remoteMainMatch[1]) {
  fail('HEAD and the freshly queried origin main tip must match');
}
const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
  encoding: 'utf8'
});
if (status.trim()) fail('a clean tracked and untracked worktree is required');
const buildInfo = parseBuildInfo(join(evidence, 'BUILD-INFO'));
const sourceDateEpoch = run('git', ['show', '-s', '--format=%ct', commit], {
  encoding: 'utf8'
}).trim();
if (
  buildInfo.commit !== commit ||
  buildInfo.source_date_epoch !== sourceDateEpoch ||
  buildInfo.compiled_network !== 'multi' ||
  buildInfo.bundle_identifier !== 'app.groot.wallet' ||
  buildInfo.signing_team_id !== teamId
) {
  fail('evidence is not the frozen multi-network release input');
}
const hwiVerification = verifySignedHwiArtifact(signedHwi, signedHwiManifest, teamId);
if (
  buildInfo.hwi_sha256 !== hwiVerification.manifest.artifact.sha256 ||
  buildInfo.signed_hwi_manifest_sha256 !== digest(signedHwiManifest)
) {
  fail('evidence is not bound to the supplied signed HWI input');
}

const stageDirectory = join(repoRoot, 'src-tauri/.release-stage');
const stagedHwi = join(stageDirectory, 'hwi');
if (existsSync(stageDirectory)) fail('release staging directory must not preexist');
const targetDirectory = resolve(process.env.CARGO_TARGET_DIR);
if (existsSync(targetDirectory) && readdirSync(targetDirectory).length > 0) {
  fail('CARGO_TARGET_DIR must be initially empty');
}
mkdirSync(targetDirectory, { recursive: true, mode: 0o700 });
mkdirSync(stageDirectory, { recursive: false, mode: 0o755 });

try {
  copyFileSync(signedHwi, stagedHwi);
  chmodSync(stagedHwi, 0o755);
  verifySignedHwiArtifact(stagedHwi, signedHwiManifest, teamId);
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', ['validate']);
  const buildEnvironment = {
    ...process.env,
    SOURCE_DATE_EPOCH: sourceDateEpoch,
    GROOT_BUILD_COMMIT: commit,
    GROOT_BUILD_NETWORK: 'multi',
    GROOT_BUNDLED_HWI_RESOURCE: 'hwi',
    GROOT_HWI_SHA256: hwiVerification.manifest.artifact.sha256,
    GROOT_MACOS_SIGNING_TEAM_ID: teamId
  };
  delete buildEnvironment.APPLE_SIGNING_IDENTITY;
  run('bash', ['scripts/release/build-packaged-macos-app.sh', targetDirectory], {
    env: buildEnvironment
  });

  const builtApp = join(targetDirectory, 'release/bundle/macos/Groot.app');
  const builtExecutable = join(builtApp, 'Contents/MacOS/Groot');
  requireRegular(builtExecutable, 'packaged Groot executable', { executable: true });
  if (digest(builtExecutable) !== digest(join(evidence, 'Groot'))) {
    fail('packaged pre-sign executable differs from the independently reproduced executable');
  }
  if (digest(join(builtApp, 'Contents/Resources/hwi')) !== digest(signedHwi)) {
    fail('packaged HWI differs from the frozen signed HWI input');
  }

  run('codesign', ['--force', '--sign', identity, '--options', 'runtime', '--timestamp', builtApp]);
  verifyPackagedHwi(builtApp, {
    manifestPath: signedHwiManifest,
    expectedTeamId: teamId,
    requireProductionSigning: true
  });
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', builtApp]);

  mkdirSync(output, { recursive: false, mode: 0o700 });
  const outputApp = join(output, 'Groot.app');
  cpSync(builtApp, outputApp, { recursive: true, preserveTimestamps: true });
  const submissionZip = join(output, '.notarization-submission.zip');
  run('ditto', ['-c', '-k', '--keepParent', outputApp, submissionZip]);
  const appNotarization = submitForNotarization(submissionZip, notaryProfile);
  rmSync(submissionZip);
  run('xcrun', ['stapler', 'staple', outputApp]);
  run('xcrun', ['stapler', 'validate', outputApp]);
  verifyPackagedHwi(outputApp, {
    manifestPath: signedHwiManifest,
    expectedTeamId: teamId,
    requireProductionSigning: true
  });
  run('bash', ['scripts/release/verify-macos-package.sh', outputApp]);

  const zip = join(output, `Groot-${packageMetadata.version}-macos-arm64.zip`);
  run('ditto', ['-c', '-k', '--keepParent', outputApp, zip]);
  const dmg = join(output, `Groot-${packageMetadata.version}-macos-arm64.dmg`);
  run('node', ['scripts/release/create-macos-dmg.mjs', outputApp, dmg, 'Groot']);
  run('codesign', ['--force', '--sign', identity, '--timestamp', dmg]);
  const dmgNotarization = submitForNotarization(dmg, notaryProfile);
  run('xcrun', ['stapler', 'staple', dmg]);
  run('xcrun', ['stapler', 'validate', dmg]);
  run('spctl', [
    '--assess',
    '--type',
    'open',
    '--context',
    'context:primary-signature',
    '--verbose=2',
    dmg
  ]);

  const signedExecutable = join(outputApp, 'Contents/MacOS/Groot');
  const sbom = join(output, 'groot.cdx.json');
  run('node', ['scripts/release/generate-sbom.mjs', sbom, signedExecutable]);
  const provenance = {
    schemaVersion: 1,
    product: 'Groot',
    version: packageMetadata.version,
    commit,
    networkIdentity: 'multi',
    bundleIdentifier: 'app.groot.wallet',
    architecture: 'arm64',
    signingTeamId: teamId,
    unsignedEvidence: {
      executableSha256: digest(join(evidence, 'Groot')),
      buildInfoSha256: digest(join(evidence, 'BUILD-INFO')),
      sbomSha256: digest(join(evidence, 'groot.cdx.json')),
      checksumManifestSha256: digest(join(evidence, 'SHA256SUMS'))
    },
    signedHwi: {
      sha256: digest(signedHwi),
      manifestSha256: digest(signedHwiManifest)
    },
    signedPackage: {
      executableSha256: digest(signedExecutable),
      zipSha256: digest(zip),
      dmgSha256: digest(dmg),
      sbomSha256: digest(sbom)
    },
    notarization: { app: appNotarization, dmg: dmgNotarization }
  };
  const provenancePath = join(output, 'PROVENANCE.json');
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600 });
  const sums = [
    ['PROVENANCE.json', provenancePath],
    [`Groot-${packageMetadata.version}-macos-arm64.zip`, zip],
    [`Groot-${packageMetadata.version}-macos-arm64.dmg`, dmg],
    ['groot.cdx.json', sbom]
  ]
    .map(([name, path]) => `${digest(path)}  ${name}`)
    .join('\n');
  writeFileSync(join(output, 'SHA256SUMS'), `${sums}\n`, { mode: 0o600 });
  console.log(`Signed and notarized GA candidate: ${output}`);
} finally {
  rmSync(stageDirectory, { recursive: true, force: true });
}
