import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verifyIosFoundationBuild,
  verifyIosArchiveResources
} from '../../../scripts/dev/verify-ios-foundation-build.mjs';
import { prepareIosProject } from '../../../scripts/dev/prepare-ios-project.mjs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const mobile = JSON.parse(read('src-tauri/tauri.ios.conf.json'));
const desktop = JSON.parse(read('src-tauri/tauri.conf.json'));
const script = read('scripts/dev/tauri-ios-foundation.sh');

describe('isolated Testnet4 iOS development build', () => {
  it('binds the native and bundled frontend to the same test network', () => {
    expect(script).toContain('export GROOT_BUILD_NETWORK=testnet4');
    expect(script).toContain('export CARGO_GROOT_IOS_REAL_CARGO=');
    expect(script).toContain('/scripts/dev/ios-cargo:');
    expect(script).toContain('export PUBLIC_BITCOIN_NETWORK=testnet4');
    expect(mobile.build.beforeBuildCommand).toBe('pnpm build:testnet4');
    expect(mobile.build.beforeDevCommand).toBeNull();
    expect(mobile.build.devUrl).toBeNull();
  });

  it('keeps storage separate from desktop and earlier Signet development', () => {
    expect(mobile.identifier).toBe('app.groot.wallet.mobile.testnet4.dev');
    expect(mobile.identifier).not.toBe(desktop.identifier);
    expect(mobile.identifier).not.toBe('app.groot.wallet.mobile.dev');
    expect(mobile.productName).toBe('Groot Testnet4 Dev');
    expect(script).toContain('unset GROOT_REGTEST_APP_DATA_DIR GROOT_MULTI_NETWORK_APP_DATA_DIR');
  });

  it('rejects a stale generated app identity before creating the unsigned archive', () => {
    const build = script.slice(script.indexOf('  build)'));
    const identityCheck = build.indexOf(`PRODUCT_BUNDLE_IDENTIFIER: ${mobile.identifier}`);
    expect(identityCheck).toBeGreaterThan(-1);
    expect(identityCheck).toBeLessThan(build.indexOf('pnpm tauri ios build'));
    expect(build).toContain('--no-sign --archive-only --ci');
    expect(build.indexOf('verify-ios-foundation-build.mjs')).toBeGreaterThan(
      build.indexOf('pnpm tauri ios build')
    );
  });
});

describe('actual iOS linked network verification', () => {
  it('rejects an archive containing a build-only static library', () => {
    const directory = mkdtempSync(join(tmpdir(), 'groot-ios-resources-'));
    try {
      writeFileSync(join(directory, 'Groot'), 'synthetic executable');
      expect(() => verifyIosArchiveResources(directory)).not.toThrow();
      writeFileSync(join(directory, 'libapp.a'), 'synthetic build-only library');
      expect(() => verifyIosArchiveResources(directory)).toThrow('Do not install this archive.');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['5.3.0-rc2', '5.3.0'])(
    'prepares isolated %s metadata without changing signing and is idempotent',
    (version) => {
      const identity = {
        identifier: mobile.identifier,
        version,
        bundleVersion: '530002'
      };
      const source = `PRODUCT_BUNDLE_IDENTIFIER: ${mobile.identifier}\n      - path: Externals\n      - sdk: Security.framework\nCFBundleShortVersionString: 5.2.0\nCFBundleVersion: "5.2.0"\nCODE_SIGN_STYLE: Automatic\n`;
      const prepared = prepareIosProject(source, identity);
      expect(prepareIosProject(prepared, identity)).toBe(prepared);
      expect(prepared).toContain('excludes: ["**/*.a"]');
      expect(prepared).toContain('LocalAuthentication.framework');
      expect(prepared).toContain('CFBundleVersion: "530002"');
      expect(prepared).toContain('CFBundleShortVersionString: 5.3.0');
      expect(prepared).toContain('CODE_SIGN_STYLE: Automatic');
      expect(() =>
        prepareIosProject(source.replace(mobile.identifier, desktop.identifier), identity)
      ).toThrow('not changed');
    }
  );

  it.each([
    '5.2.0',
    '5.3.1',
    '5.4.0',
    '5.3.0-rc0',
    '5.3.0-rc01',
    '5.3.0-beta1',
    '5.3.0+build',
    '5.3.0-rc2-extra'
  ])('rejects unapproved development version %s before preparing metadata', (version) => {
    const source = `PRODUCT_BUNDLE_IDENTIFIER: ${mobile.identifier}\n`;
    expect(() =>
      prepareIosProject(source, { identifier: mobile.identifier, version, bundleVersion: '530012' })
    ).toThrow('Unexpected iOS development identity');
  });

  it('rejects a different identity even when the generated source matches it', () => {
    expect(() =>
      prepareIosProject(`PRODUCT_BUNDLE_IDENTIFIER: ${desktop.identifier}\n`, {
        identifier: desktop.identifier,
        version: '5.3.0',
        bundleVersion: '530012'
      })
    ).toThrow('Unexpected iOS development identity');
  });

  it.each([
    ['testnet4', 'same', true],
    ['regtest', 'same', false],
    ['testnet4', 'different', false]
  ])('checks %s and %s library bytes', (network, bytes, passes) => {
    const root = mkdtempSync(join(tmpdir(), 'groot-ios-network-'));
    try {
      const profile = join(root, 'aarch64-apple-ios/debug');
      mkdirSync(join(profile, 'build/groot-1234'), { recursive: true });
      mkdirSync(join(profile, 'build/groot-5678'), { recursive: true });
      writeFileSync(join(profile, 'libgroot_lib.d'), `${profile}/build/groot-1234/out/context.rs`);
      writeFileSync(
        join(profile, 'build/groot-1234/output'),
        `cargo:rustc-cfg=groot_network="${network}"`
      );
      // This unrelated newer check must not hide a wrong linked network.
      writeFileSync(
        join(profile, 'build/groot-5678/output'),
        'cargo:rustc-cfg=groot_network="testnet4"'
      );
      writeFileSync(join(profile, 'libgroot_lib.a'), 'same');
      const xcode = join(root, 'libapp.a');
      writeFileSync(xcode, bytes);
      const verify = () => verifyIosFoundationBuild(root, xcode);
      if (passes) expect(verify).not.toThrow();
      else expect(verify).toThrow('Do not install this archive.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
