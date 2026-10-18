import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyIosFoundationBuild } from '../../../scripts/dev/verify-ios-foundation-build.mjs';
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
