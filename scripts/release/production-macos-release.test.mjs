import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyNativeFrontendOutput } from './verify-native-frontend-output.mjs';
import { validateSignedHwiSignatureMetadata } from './verify-signed-hwi.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const packageJson = JSON.parse(read('../../package.json'));
const tauriConfig = JSON.parse(read('../../src-tauri/tauri.conf.json'));

const validSignature = `
Authority=Developer ID Application: Groot Wallet (6Z85HGDUU7)
TeamIdentifier=6Z85HGDUU7
Timestamp=Oct 1, 2026 at 09:00:00
flags=0x10000(runtime) kilobytes=0
`;
const validEntitlements = `
<plist><dict>
<key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
`;

test('signed HWI policy requires the exact team, hardened runtime, timestamp, and entitlement', () => {
  assert.doesNotThrow(() =>
    validateSignedHwiSignatureMetadata(validSignature, validEntitlements, '6Z85HGDUU7')
  );
  assert.throws(
    () =>
      validateSignedHwiSignatureMetadata(validSignature, '<plist><dict/></plist>', '6Z85HGDUU7'),
    /library-validation entitlement/
  );
  assert.throws(
    () =>
      validateSignedHwiSignatureMetadata(
        validSignature.replace('flags=0x10000(runtime)', 'flags=0x0(none)'),
        validEntitlements,
        '6Z85HGDUU7'
      ),
    /hardened runtime/
  );
  assert.throws(
    () =>
      validateSignedHwiSignatureMetadata(
        validSignature.replace('Timestamp=Oct 1, 2026 at 09:00:00', 'Timestamp=none'),
        validEntitlements,
        '6Z85HGDUU7'
      ),
    /secure timestamp/
  );
  assert.throws(
    () => validateSignedHwiSignatureMetadata(validSignature, validEntitlements, 'ABCDEFGHIJ'),
    /expected Developer ID team/
  );
});

test('multi-network evidence builder is release-bound and uses signed HWI provenance', () => {
  const source = read('./build-unsigned-multi.sh');
  const validation = source.indexOf('pnpm validate');
  const frontendBuild = source.indexOf('TAURI_ENV_PLATFORM=macos pnpm build:multi');
  const frontendVerification = source.indexOf(
    'node scripts/release/verify-native-frontend-output.mjs build'
  );
  const cargoBuild = source.indexOf('cargo build --locked');
  assert.match(source, /export GROOT_BUILD_NETWORK=multi/);
  assert.match(source, /bundle_identifier=app\.groot\.wallet/);
  assert.match(source, /--features tauri\/custom-protocol/);
  assert.match(source, /verify-signed-hwi\.mjs/);
  assert.match(source, /signed_hwi_manifest_sha256=/);
  assert.match(source, /multi_config_sha256=/);
  assert.ok(
    validation >= 0 &&
      frontendBuild > validation &&
      frontendVerification > frontendBuild &&
      cargoBuild > frontendVerification
  );
  assert.doesNotMatch(source, /GROOT_MACOS_SIGNING_IDENTITY|notarytool|stapler/);
  assert.equal(
    packageJson.scripts['release:unsigned:multi'],
    'bash scripts/release/build-unsigned-multi.sh'
  );
});

test('production package binds the exact reproduced payload before signing', () => {
  const source = read('./package-macos-ga.mjs');
  const authorization = source.indexOf('verifyPublicReleaseAuthorization({ repoRoot, commit })');
  const comparison = source.indexOf("digest(builtExecutable) !== digest(join(evidence, 'Groot'))");
  const appSigning = source.indexOf("run('codesign', ['--force', '--sign', identity");
  assert.ok(authorization >= 0 && comparison > authorization && appSigning > comparison);
  assert.doesNotMatch(
    source,
    /normalize-macho-uuid\.mjs', builtExecutable|--verify', '--strict', builtExecutable/
  );
  assert.match(source, /SOURCE_DATE_EPOCH: sourceDateEpoch/);
  assert.match(source, /buildInfo\.source_date_epoch !== sourceDateEpoch/);
  assert.match(source, /build-packaged-macos-app\.sh/);
  assert.match(source, /GROOT_BUILD_NETWORK: 'multi'/);
  assert.match(source, /GROOT_HWI_SHA256: hwiVerification\.manifest\.artifact\.sha256/);
  assert.match(source, /'ls-remote', '--exit-code', 'origin', 'refs\/heads\/main'/);
  assert.match(source, /'notarytool',[\s\S]{0,40}'submit'/);
  assert.match(source, /'stapler', 'staple'/);
  assert.match(source, /verifyPackagedHwi\(outputApp/);
  assert.ok(
    source.indexOf("'stapler', 'staple'") <
      source.indexOf("'scripts/release/verify-macos-package.sh', outputApp")
  );
  assert.match(source, /'scripts\/release\/create-macos-dmg\.mjs', outputApp, dmg, 'Groot'/);
  assert.doesNotMatch(source, /codesign[\s\S]{0,200}--deep[\s\S]{0,200}--sign/);
  assert.equal(
    packageJson.scripts['release:package:macos:ga'],
    'node scripts/release/package-macos-ga.mjs'
  );
});

test('packaged app carries the base license and attribution resources', () => {
  assert.equal(packageJson.license, 'Apache-2.0');
  assert.equal(tauriConfig.bundle.resources['../LICENSE'], 'LICENSE.txt');
  assert.equal(tauriConfig.bundle.resources['../NOTICE'], 'NOTICE.txt');
  assert.equal(tauriConfig.bundle.resources['../THIRD_PARTY_NOTICES.md'], 'THIRD_PARTY_NOTICES.md');
});

test('macOS DMG presents a compact branded drag-to-Applications layout', () => {
  const source = read('./create-macos-dmg.mjs');
  const background = read('./assets/groot-dmg-background.svg');
  const finderLayout = readFileSync(new URL('./assets/groot-dmg.DS_Store', import.meta.url));
  const renderedBackground = readFileSync(
    new URL('./assets/groot-dmg-background.png', import.meta.url)
  );
  assert.match(source, /symlinkSync\('\/Applications'/);
  assert.match(source, /volumeName !== 'Groot'/);
  assert.match(source, /groot-dmg\.DS_Store/);
  assert.doesNotMatch(source, /osascript|tell application "Finder"/);
  assert.match(source, /groot-dmg-background\.png/);
  assert.match(source, /the DMG background does not match the reviewed release asset/);
  assert.match(source, /writeFileSync\([^;]+backgroundBytes\)/s);
  assert.match(background, />Install Groot</);
  assert.match(background, />Drag the app into Applications</);
  assert.ok(renderedBackground.length > 10_000);
  assert.equal(
    createHash('sha256').update(renderedBackground).digest('hex'),
    'a6360c8591eb889ebfbd07cf185db40b8d46e438baa6ae09efc6daf54c941cd0'
  );
  assert.equal(finderLayout.length, 10_244);
  assert.equal(
    createHash('sha256').update(finderLayout).digest('hex'),
    '26e006bf8e4965f75c976fea86e219abc109763673e0685650576cc303d65ec7'
  );
});

test('packaged app build uses the same reproducible Rust environment as evidence', () => {
  const source = read('./build-packaged-macos-app.sh');
  const frontendBuild = source.indexOf('TAURI_ENV_PLATFORM=macos pnpm build:multi');
  const frontendVerification = source.indexOf(
    'node scripts/release/verify-native-frontend-output.mjs build'
  );
  const cargoBuild = source.indexOf('cargo build');
  assert.match(source, /source "\$repo_root\/scripts\/release\/reproducible-rust-env\.sh"/);
  assert.match(source, /configure_reproducible_rust_env "\$repo_root" "\$cargo_target"/);
  assert.ok(
    frontendBuild >= 0 && frontendVerification > frontendBuild && cargoBuild > frontendVerification
  );
  assert.match(
    source,
    /cargo build[\s\\]*--locked[\s\\]*--release[\s\\]*--manifest-path src-tauri\/Cargo\.toml[\s\\]*--features tauri\/custom-protocol/
  );
  assert.match(source, /normalize-macho-uuid\.mjs "\$built_executable"/);
  assert.match(source, /pnpm exec tauri bundle/);
  assert.match(source, /src-tauri\/tauri\.multi\.conf\.json/);
  assert.match(source, /--bundles app/);
  assert.match(source, /--no-sign/);
  assert.doesNotMatch(source, /pnpm exec tauri build/);
});

test('native frontend verification rejects browser and missing-bridge bundles', () => {
  const root = mkdtempSync(join(tmpdir(), 'groot-native-frontend-test-'));
  try {
    const nativeOutput = join(root, 'native');
    mkdirSync(join(nativeOutput, '_app'), { recursive: true });
    writeFileSync(join(nativeOutput, '_app', 'native.js'), 'const command = "runtime_platform";');
    assert.deepEqual(verifyNativeFrontendOutput(nativeOutput), {
      output: nativeOutput,
      javascriptFiles: 1
    });

    const browserOutput = join(root, 'browser');
    mkdirSync(browserOutput);
    writeFileSync(
      join(browserOutput, 'browser.js'),
      'const command = "runtime_platform"; const fixture = "virtual-ledger-outsider";'
    );
    assert.throws(
      () => verifyNativeFrontendOutput(browserOutput),
      /browser prototype code survived/
    );

    const missingBridgeOutput = join(root, 'missing-bridge');
    mkdirSync(missingBridgeOutput);
    writeFileSync(join(missingBridgeOutput, 'app.js'), 'const app = "Groot";');
    assert.throws(
      () => verifyNativeFrontendOutput(missingBridgeOutput),
      /native runtime bridge is absent/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('signed HWI is authenticated before any version execution', () => {
  const source = read('./verify-signed-hwi.mjs');
  const signatureVerification = source.indexOf("execFileSync('codesign', ['--verify'");
  const versionExecution = source.indexOf('probeHwiVersionOnDisposableCopy(hwi);');
  assert.ok(signatureVerification >= 0 && versionExecution > signatureVerification);
  assert.match(source, /copyFileSync\(hwi, probe\)/);
  assert.match(source, /execFileSync\(probe, \['--version'\]/);
  assert.doesNotMatch(source, /execFileSync\(hwi, \['--version'\]/);
  assert.ok(
    source.indexOf("execFileSync('codesign', ['--verify'", versionExecution) > versionExecution
  );
});

test('HWI signing is isolated to its reviewed entitlement and does not notarize', () => {
  const source = read('./prepare-signed-hwi.mjs');
  assert.match(source, /hwi-entitlements\.plist/);
  assert.match(source, /'--options',\n\s*'runtime'/);
  assert.match(source, /'--timestamp'/);
  assert.doesNotMatch(source, /notarytool|stapler|GROOT_MACOS_NOTARY_PROFILE/);
  assert.equal(
    packageJson.scripts['release:prepare:signed-hwi'],
    'node scripts/release/prepare-signed-hwi.mjs'
  );
});
