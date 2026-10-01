import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateSignedHwiSignatureMetadata } from './verify-signed-hwi.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const packageJson = JSON.parse(read('../../package.json'));

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
  assert.match(source, /export GROOT_BUILD_NETWORK=multi/);
  assert.match(source, /bundle_identifier=app\.groot\.wallet/);
  assert.match(source, /--features tauri\/custom-protocol/);
  assert.match(source, /verify-signed-hwi\.mjs/);
  assert.match(source, /signed_hwi_manifest_sha256=/);
  assert.match(source, /multi_config_sha256=/);
  assert.doesNotMatch(source, /GROOT_MACOS_SIGNING_IDENTITY|notarytool|stapler/);
  assert.equal(
    packageJson.scripts['release:unsigned:multi'],
    'bash scripts/release/build-unsigned-multi.sh'
  );
});

test('production package binds the exact reproduced payload before signing', () => {
  const source = read('./package-macos-ga.mjs');
  const normalization = source.indexOf(
    "'scripts/release/normalize-macho-uuid.mjs', builtExecutable"
  );
  const comparison = source.indexOf("digest(builtExecutable) !== digest(join(evidence, 'Groot'))");
  const appSigning = source.indexOf("run('codesign', ['--force', '--sign', identity");
  assert.ok(normalization >= 0 && comparison > normalization && appSigning > comparison);
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
  assert.match(source, /mkdtempSync[\s\S]*cpSync\(outputApp, join\(dmgRoot, 'Groot\.app'\)/);
  assert.doesNotMatch(source, /codesign[\s\S]{0,200}--deep[\s\S]{0,200}--sign/);
  assert.equal(
    packageJson.scripts['release:package:macos:ga'],
    'node scripts/release/package-macos-ga.mjs'
  );
});

test('packaged app build uses the same reproducible Rust environment as evidence', () => {
  const source = read('./build-packaged-macos-app.sh');
  assert.match(source, /source "\$repo_root\/scripts\/release\/reproducible-rust-env\.sh"/);
  assert.match(source, /configure_reproducible_rust_env "\$repo_root" "\$cargo_target"/);
  assert.match(source, /src-tauri\/tauri\.multi\.conf\.json/);
  assert.match(source, /--bundles app/);
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
