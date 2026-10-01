import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  validateCompiledTeamId,
  validateProductionSignatureMetadata,
  verifyPackagedHwi
} from './verify-packaged-hwi.mjs';

const macTest = process.platform === 'darwin' ? test : test.skip;

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'groot-packaged-hwi-'));
  const app = join(root, 'Groot Testnet4.app');
  const resources = join(app, 'Contents', 'Resources');
  const macos = join(app, 'Contents', 'MacOS');
  mkdirSync(resources, { recursive: true });
  mkdirSync(macos, { recursive: true });
  const executable = join(macos, 'Groot');
  const hwi = join(resources, 'hwi');
  writeFileSync(
    executable,
    '#!/bin/sh\n# GROOT_COMPILED_MACOS_SIGNING_TEAM_ID:ABCDEFGHIJ\nexit 0\n'
  );
  chmodSync(executable, 0o755);
  writeFileSync(hwi, '#!/bin/sh\nprintf "hwi 3.2.0\\n"\n');
  chmodSync(hwi, 0o755);
  writeFileSync(
    join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Groot</string>
<key>CFBundleIdentifier</key><string>app.groot.wallet.test</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.4.8</string>
<key>CFBundleVersion</key><string>0.4.8</string>
</dict></plist>\n`
  );
  const manifestPath = join(root, 'manifest.json');
  const hwiEntitlements = join(root, 'hwi-entitlements.plist');
  writeFileSync(
    hwiEntitlements,
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>com.apple.security.cs.disable-library-validation</key><true/></dict></plist>\n'
  );
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      artifact: { filename: 'hwi', sha256: digest(hwi) },
      kind: 'groot-signed-hwi',
      platform: 'macos-arm64',
      schemaVersion: 1,
      signing: {
        entitlements: ['com.apple.security.cs.disable-library-validation'],
        hardenedRuntime: true,
        secureTimestamp: true,
        teamId: 'ABCDEFGHIJ'
      },
      upstream: {
        filename: 'hwi',
        licenseSha256: 'fd02c0dfea382dd4c42bcf87f1d638fcc5962238a319447d3ca035074bcd07f7',
        sha256: '87a8991848a0216213ddf6497c753cebbda492626afaf5608c30931155c922c3',
        sourceArchiveSha256: '4a225a2e22990fa114066feafcd3cb66a6ecaa3711a0d8a0cad61e7f8c507455'
      },
      version: '3.2.0'
    })}\n`
  );
  execFileSync('codesign', [
    '--force',
    '--sign',
    '-',
    '--timestamp=none',
    '--options',
    'runtime',
    '--entitlements',
    hwiEntitlements,
    hwi
  ]);
  chmodSync(hwi, 0o755);
  // Signing changes executable bytes, so record the final reviewed artifact.
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.artifact.sha256 = digest(hwi);
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  execFileSync('codesign', [
    '--force',
    '--sign',
    '-',
    '--timestamp=none',
    '--options',
    'runtime',
    app
  ]);
  return { root, app, hwi, manifestPath, hwiEntitlements };
}

macTest('accepts a sealed app with the exact reviewed HWI and pre-1.0 version', () => {
  const value = fixture();
  try {
    const result = verifyPackagedHwi(value.app, {
      manifestPath: value.manifestPath,
      expectedAppVersion: '0.4.8',
      requireProductionSigning: false
    });
    assert.equal(result.version, 'hwi 3.2.0');
    assert.equal(result.appVersion, '0.4.8');
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

macTest('rejects an HWI changed after the app was sealed', () => {
  const value = fixture();
  try {
    writeFileSync(value.hwi, '#!/bin/sh\nprintf "hwi 3.2.0\\n"\n# changed\n');
    chmodSync(value.hwi, 0o555);
    assert.throws(
      () =>
        verifyPackagedHwi(value.app, {
          manifestPath: value.manifestPath,
          expectedAppVersion: '0.4.8',
          requireProductionSigning: false
        }),
      /SHA-256 does not match/
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

macTest('rejects a package whose visible version is not the release version', () => {
  const value = fixture();
  try {
    assert.throws(
      () =>
        verifyPackagedHwi(value.app, {
          manifestPath: value.manifestPath,
          expectedAppVersion: '0.4.9',
          requireProductionSigning: false
        }),
      /CFBundleShortVersionString is 0\.4\.8, expected 0\.4\.9/
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

macTest(
  'rejects production verification without hardened runtime and reviewed entitlements',
  () => {
    const value = fixture();
    try {
      execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', value.hwi]);
      const manifest = JSON.parse(readFileSync(value.manifestPath, 'utf8'));
      manifest.artifact.sha256 = digest(value.hwi);
      writeFileSync(value.manifestPath, `${JSON.stringify(manifest)}\n`);
      execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', value.app]);
      assert.throws(
        () =>
          verifyPackagedHwi(value.app, {
            manifestPath: value.manifestPath,
            expectedAppVersion: '0.4.8',
            expectedTeamId: 'ABCDEFGHIJ'
          }),
        /hardened runtime|Developer ID team/
      );
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  }
);

test('production signing policy requires matching team, timestamps, and helper-only entitlement', () => {
  const signature = (team) =>
    `flags=0x10000(runtime)\nAuthority=Developer ID Application: Groot (${team})\nTeamIdentifier=${team}\nTimestamp=Sep 3, 2026 at 10:00:00`;
  const entitlement =
    '<plist><dict><key>com.apple.security.cs.disable-library-validation</key><true/></dict></plist>';
  assert.doesNotThrow(() =>
    validateProductionSignatureMetadata(
      signature('ABCDEFGHIJ'),
      signature('ABCDEFGHIJ'),
      '<plist><dict/></plist>',
      entitlement,
      'ABCDEFGHIJ'
    )
  );
  assert.throws(
    () =>
      validateProductionSignatureMetadata(
        signature('ABCDEFGHIJ'),
        signature('ABCDEFGHIJ'),
        '<plist><dict/></plist>',
        entitlement
      ),
    /requires the expected 10-character Developer ID team/
  );
  assert.throws(
    () =>
      validateProductionSignatureMetadata(
        signature('ABCDEFGHIJ'),
        signature('KLMNOPQRST'),
        '<plist><dict/></plist>',
        entitlement,
        'ABCDEFGHIJ'
      ),
    /matching Developer ID team/
  );
  assert.throws(
    () =>
      validateProductionSignatureMetadata(
        signature('ABCDEFGHIJ').replace('Developer ID Application', 'Apple Development'),
        signature('ABCDEFGHIJ'),
        '<plist><dict/></plist>',
        entitlement,
        'ABCDEFGHIJ'
      ),
    /Developer ID Application certificates/
  );
  assert.throws(
    () =>
      validateProductionSignatureMetadata(
        signature('ABCDEFGHIJ'),
        signature('ABCDEFGHIJ'),
        entitlement,
        entitlement,
        'ABCDEFGHIJ'
      ),
    /Groot must not disable library validation/
  );
});

test('production verification binds the runtime-compiled Team ID requirement', () => {
  assert.doesNotThrow(() =>
    validateCompiledTeamId(
      Buffer.from('prefix GROOT_COMPILED_MACOS_SIGNING_TEAM_ID:ABCDEFGHIJ suffix'),
      'ABCDEFGHIJ'
    )
  );
  assert.throws(
    () =>
      validateCompiledTeamId(
        Buffer.from('GROOT_COMPILED_MACOS_SIGNING_TEAM_ID:REHEARSAL_ONLY'),
        'ABCDEFGHIJ'
      ),
    /not compiled with the expected Developer ID team requirement/
  );
});
