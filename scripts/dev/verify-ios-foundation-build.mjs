import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {string} target @param {string} xcodeLibrary */
export function verifyIosFoundationBuild(target, xcodeLibrary) {
  const profile = join(resolve(target), 'aarch64-apple-ios', 'debug');
  // Read the dependency file belonging to the linked static library. A newer
  // all-feature Clippy output does not establish the archived app's network.
  const dependencies = readFileSync(join(profile, 'libgroot_lib.d'), 'utf8');
  const owners = [
    ...new Set([...dependencies.matchAll(/\/build\/(groot-[a-f0-9]+)\//g)].map((match) => match[1]))
  ];
  if (owners.length !== 1) {
    throw new Error(
      'Cannot identify the archived library build script. Do not install this archive.'
    );
  }
  const output = join(profile, 'build', owners[0], 'output');
  if (!readFileSync(output, 'utf8').includes('cargo:rustc-cfg=groot_network="testnet4"')) {
    throw new Error(
      'The actual iOS Rust build did not report Testnet4. Do not install this archive.'
    );
  }
  /** @param {string} path */
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
  if (digest(join(profile, 'libgroot_lib.a')) !== digest(xcodeLibrary)) {
    throw new Error(
      'The Xcode library differs from the checked Cargo library. Do not install this archive.'
    );
  }
}

/** @param {string} app */
export function verifyIosArchiveResources(app) {
  if (readdirSync(app, { recursive: true }).some((name) => String(name).endsWith('.a'))) {
    throw new Error(
      'The iOS app contains a build-only static library. Do not install this archive.'
    );
  }
}

/**
 * @param {{UIApplicationSceneManifest?: {
 *   UIApplicationSupportsMultipleScenes?: boolean,
 *   UISceneConfigurations?: Record<string, Record<string, string>[]>
 * }}} info
 */
export function verifyIosSceneManifest(info) {
  const manifest = info.UIApplicationSceneManifest;
  const configurations = manifest?.UISceneConfigurations;
  const application = configurations?.UIWindowSceneSessionRoleApplication;
  if (
    manifest?.UIApplicationSupportsMultipleScenes !== false ||
    Object.keys(configurations ?? {}).length !== 1 ||
    !Array.isArray(application) ||
    application.length !== 1 ||
    application[0]?.UISceneConfigurationName !== 'Default Configuration' ||
    application[0].UISceneClassName !== 'UIWindowScene' ||
    application[0].UISceneDelegateClassName !== 'TaoSceneDelegate' ||
    Object.hasOwn(application[0], 'UISceneStoryboardFile')
  ) {
    throw new Error(
      'The iOS app must declare one Tao window scene without multiple scenes. Do not install this archive.'
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app =
    'src-tauri/gen/apple/build/groot_iOS.xcarchive/Products/Applications/Groot Testnet4 Dev.app';
  verifyIosFoundationBuild(process.argv[2], 'src-tauri/gen/apple/Externals/arm64/debug/libapp.a');
  verifyIosArchiveResources(app);
  verifyIosSceneManifest(
    JSON.parse(
      execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Info.plist')], {
        encoding: 'utf8'
      })
    )
  );
  console.log(
    'iOS native build verified: Testnet4, exact linked Cargo library, and one Tao window scene.'
  );
}
