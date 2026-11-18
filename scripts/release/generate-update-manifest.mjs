#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';

const MAX_INSTALLER_BYTES = 2 * 1024 * 1024 * 1024;
const PLATFORM_SUFFIXES = ['macos-arm64.dmg', 'windows-x64.msi', 'linux-x64.deb'];
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const U64_MAX = 18_446_744_073_709_551_615n;

function versionTriplet(value, stable) {
  if (value.length > 255 || value !== value.trim()) return null;
  const match = SEMVER.exec(value);
  if (!match || (match[4] && (stable || match[4].split('.').some((part) => /^0\d+$/.test(part))))) {
    return null;
  }
  const parts = match.slice(1, 4);
  if (parts.some((part) => part.length > 20)) return null;
  const numbers = parts.map(BigInt);
  return numbers.some((number) => number > U64_MAX) ? null : numbers;
}

function sameFile(first, second) {
  return (
    second.isFile() &&
    first.dev === second.dev &&
    first.ino === second.ino &&
    first.size === second.size &&
    first.mtimeNs === second.mtimeNs &&
    first.ctimeNs === second.ctimeNs
  );
}

function installerDigest(path) {
  const initial = lstatSync(path, { bigint: true });
  if (!initial.isFile() || initial.size === 0n || initial.size > BigInt(MAX_INSTALLER_BYTES)) {
    throw new Error('installer must be a non-empty regular file of at most 2 GiB');
  }
  const fd = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
  );
  try {
    if (!sameFile(initial, fstatSync(fd, { bigint: true }))) {
      throw new Error('installer changed before hashing');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    const size = Number(initial.size);
    let bytes = 0;
    while (bytes < size) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, size - bytes), null);
      if (count === 0) throw new Error('installer changed while hashing');
      hash.update(buffer.subarray(0, count));
      bytes += count;
    }
    if (
      !sameFile(initial, fstatSync(fd, { bigint: true })) ||
      !sameFile(initial, lstatSync(path, { bigint: true }))
    ) {
      throw new Error('installer changed while hashing');
    }
    return hash.digest('hex');
  } finally {
    closeSync(fd);
  }
}

try {
  if (process.argv.length !== 6) {
    throw new Error(
      'usage: generate-update-manifest.mjs ABSOLUTE_INSTALLER VERSION FULL_COMMIT MINIMUM_SUPPORTED_VERSION'
    );
  }
  const [installerPath, version, commit, minimumSupportedVersion] = process.argv.slice(2);
  const releaseTriplet = versionTriplet(version, true);
  if (!releaseTriplet) throw new Error('version must be a stable semantic version');
  const minimumTriplet = versionTriplet(minimumSupportedVersion, false);
  if (!minimumTriplet) {
    throw new Error('minimum supported version must be an exact semantic version');
  }
  const differingIndex = minimumTriplet.findIndex((part, index) => part !== releaseTriplet[index]);
  if (differingIndex !== -1 && minimumTriplet[differingIndex] > releaseTriplet[differingIndex]) {
    throw new Error('minimum supported version must not be newer than the release version');
  }
  if (commit.length !== 40 || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('commit must be a full lowercase SHA-1');
  }
  if (!isAbsolute(installerPath)) throw new Error('installer path must be absolute');
  const artifact = basename(installerPath);
  if (!PLATFORM_SUFFIXES.some((suffix) => artifact === `Groot-${version}-${suffix}`)) {
    throw new Error('installer basename must match a supported platform and the release version');
  }
  const manifest = {
    artifact,
    channel: 'stable',
    commit,
    minimumSupportedVersion,
    product: 'Groot',
    rollbackAllowedFrom: [],
    schemaVersion: 1,
    sha256: installerDigest(installerPath),
    version
  };
  // Stdout is the exact unsigned manifest; signing and release approval are separate.
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
} catch (error) {
  console.error(
    `Update manifest generation failed: ${error.code ? 'could not read installer' : error.message}`
  );
  process.exitCode = 1;
}
