import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyPackagedHwi } from './verify-packaged-hwi.mjs';

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
  writeFileSync(executable, '#!/bin/sh\nexit 0\n');
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
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      artifact: { filename: 'hwi', sha256: digest(hwi) },
      name: 'Bitcoin Core HWI',
      schemaVersion: 1,
      version: '3.2.0'
    })}\n`
  );
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', hwi]);
  chmodSync(hwi, 0o755);
  // Signing changes executable bytes, so record the final reviewed artifact.
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.artifact.sha256 = digest(hwi);
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', app]);
  return { root, app, hwi, manifestPath };
}

test('accepts a sealed app with the exact reviewed HWI and pre-1.0 version', () => {
  const value = fixture();
  try {
    const result = verifyPackagedHwi(value.app, {
      manifestPath: value.manifestPath,
      expectedAppVersion: '0.4.8'
    });
    assert.equal(result.version, 'hwi 3.2.0');
    assert.equal(result.appVersion, '0.4.8');
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('rejects an HWI changed after the app was sealed', () => {
  const value = fixture();
  try {
    writeFileSync(value.hwi, '#!/bin/sh\nprintf "hwi 3.2.0\\n"\n# changed\n');
    chmodSync(value.hwi, 0o555);
    assert.throws(
      () =>
        verifyPackagedHwi(value.app, {
          manifestPath: value.manifestPath,
          expectedAppVersion: '0.4.8'
        }),
      /SHA-256 does not match/
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('rejects a package whose visible version is not the release version', () => {
  const value = fixture();
  try {
    assert.throws(
      () =>
        verifyPackagedHwi(value.app, {
          manifestPath: value.manifestPath,
          expectedAppVersion: '0.4.9'
        }),
      /CFBundleShortVersionString is 0\.4\.8, expected 0\.4\.9/
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
