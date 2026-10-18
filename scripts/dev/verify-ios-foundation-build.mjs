import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyIosFoundationBuild(process.argv[2], 'src-tauri/gen/apple/Externals/arm64/debug/libapp.a');
  verifyIosArchiveResources(
    'src-tauri/gen/apple/build/groot_iOS.xcarchive/Products/Applications/Groot Testnet4 Dev.app'
  );
  console.log(
    'iOS native build verified: Testnet4, and Xcode uses the exact compiled Cargo library.'
  );
}
