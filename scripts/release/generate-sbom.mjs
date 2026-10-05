#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBomRefs } from './sbom-order.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const [output, artifact] = process.argv.slice(2);
if (!output || process.argv.length > 4) {
  console.error('usage: generate-sbom.mjs /path/to/groot.cdx.json [/path/to/built-artifact]');
  process.exit(2);
}

const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8'
}).trim();
const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
  .split('\n')
  .find((line) => line.startsWith('host: '))
  ?.slice(6);
if (!host) throw new Error('Could not determine the Rust host target.');

const cargoMetadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--locked', '--format-version', '1', '--filter-platform', host],
    { cwd: join(repoRoot, 'src-tauri'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
);

const cargoChecksums = new Map();
for (const block of read('src-tauri/Cargo.lock').split('[[package]]').slice(1)) {
  const name = block.match(/^\s*name = "([^"]+)"/m)?.[1];
  const version = block.match(/^\s*version = "([^"]+)"/m)?.[1];
  const checksum = block.match(/^\s*checksum = "([a-f0-9]+)"/m)?.[1];
  if (name && version && checksum) cargoChecksums.set(`${name}@${version}`, checksum);
}

const resolvedCargoIds = new Set(cargoMetadata.resolve.nodes.map((node) => node.id));

function licenseEntry(expression, licenseFile) {
  if (expression) return [{ license: { name: expression } }];
  if (!licenseFile) throw new Error('A dependency is missing license metadata.');
  const text = readFileSync(licenseFile, 'utf8');
  if (!text.trim() || Buffer.byteLength(text) > 128 * 1024) {
    throw new Error(`A declared dependency license file is empty or oversized: ${licenseFile}`);
  }
  return [
    {
      license: { name: `Declared license file: ${basename(licenseFile)}`, text: { content: text } }
    }
  ];
}

const components = cargoMetadata.packages
  .filter((pkg) => resolvedCargoIds.has(pkg.id) && !(pkg.name === 'groot' && pkg.source === null))
  .map((pkg) => {
    const checksum = cargoChecksums.get(`${pkg.name}@${pkg.version}`);
    const basePurl = `pkg:cargo/${pkg.name}@${pkg.version}`;
    const purl = pkg.source === null ? `${basePurl}?repository=vendored` : basePurl;
    if (pkg.source?.startsWith('registry+') && !checksum) {
      throw new Error(
        `Registry crate is missing its lockfile checksum: ${pkg.name}@${pkg.version}`
      );
    }
    return {
      type: 'library',
      'bom-ref': purl,
      name: pkg.name,
      version: pkg.version,
      purl,
      licenses: licenseEntry(
        pkg.license,
        pkg.license_file ? resolve(dirname(pkg.manifest_path), pkg.license_file) : null
      ),
      ...(checksum ? { hashes: [{ alg: 'SHA-256', content: checksum }] } : {}),
      properties: [
        { name: 'groot:ecosystem', value: 'cargo' },
        { name: 'groot:source', value: pkg.source === null ? 'vendored-path' : pkg.source }
      ]
    };
  });

const packageSection = read('pnpm-lock.yaml').split('\npackages:\n')[1]?.split('\nsnapshots:\n')[0];
if (!packageSection) throw new Error('pnpm-lock.yaml has no packages section.');
const lockedNodePackages = new Map();
for (const match of packageSection.matchAll(
  /^  (?:'([^']+)'|([^:\n]+)):\n([\s\S]*?)(?=^  (?:'[^']+'|[^:\n]+):\n|$)/gm
)) {
  const key = match[1] ?? match[2];
  const integrity = match[3].match(/resolution: \{integrity: ([^,}\s]+)/)?.[1];
  lockedNodePackages.set(key, integrity);
}

const installedNodePackages = new Map();
for (const entry of readdirSync(join(repoRoot, 'node_modules/.pnpm'))) {
  const modules = join(repoRoot, 'node_modules/.pnpm', entry, 'node_modules');
  try {
    if (!statSync(modules).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const name of readdirSync(modules)) {
    const candidates = name.startsWith('@')
      ? readdirSync(join(modules, name)).map((child) => join(modules, name, child, 'package.json'))
      : [join(modules, name, 'package.json')];
    for (const manifest of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
        installedNodePackages.set(`${pkg.name}@${pkg.version}`, pkg);
      } catch {
        // Peer-link directories and non-package entries are intentionally ignored.
      }
    }
  }
}

for (const [key, pkg] of installedNodePackages) {
  if (!lockedNodePackages.has(key))
    throw new Error(`Installed Node package is absent from pnpm-lock.yaml: ${key}`);
  const integrity = lockedNodePackages.get(key);
  if (!integrity?.startsWith('sha512-'))
    throw new Error(`Node package is missing SHA-512 lockfile integrity: ${key}`);
  const purlName = pkg.name.startsWith('@')
    ? `%40${pkg.name.slice(1).split('/')[0]}/${pkg.name.split('/')[1]}`
    : pkg.name;
  components.push({
    type: 'library',
    'bom-ref': `pkg:npm/${purlName}@${pkg.version}`,
    name: pkg.name,
    version: pkg.version,
    purl: `pkg:npm/${purlName}@${pkg.version}`,
    licenses: licenseEntry(typeof pkg.license === 'string' ? pkg.license : pkg.licenses?.[0]?.type),
    hashes: [
      { alg: 'SHA-512', content: Buffer.from(integrity.slice(7), 'base64').toString('hex') }
    ],
    properties: [{ name: 'groot:ecosystem', value: 'npm' }]
  });
}

components.sort(compareBomRefs);
const packageManifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const appVersion = packageManifest.version;
if (typeof appVersion !== 'string' || !/^0\.\d+\.\d+$/.test(appVersion)) {
  throw new Error('package.json must contain a pre-1.0 semantic version');
}
let artifactEvidence;
if (artifact) {
  const artifactPath = resolve(artifact);
  const artifactStat = lstatSync(artifactPath);
  if (artifactStat.isSymbolicLink() || !artifactStat.isFile() || artifactStat.size === 0) {
    throw new Error('The release artifact must be a non-empty regular file, not a symlink.');
  }
  const artifactSha256 = await new Promise((resolveDigest, reject) => {
    const hash = createHash('sha256');
    createReadStream(artifactPath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolveDigest(hash.digest('hex')));
  });
  artifactEvidence = {
    filename: basename(artifactPath),
    sha256: artifactSha256
  };
}

const lockSha256 = (path) =>
  createHash('sha256')
    .update(readFileSync(join(repoRoot, path)))
    .digest('hex');
const appRef = `pkg:cargo/groot@${appVersion}`;
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    component: {
      type: 'application',
      'bom-ref': appRef,
      name: 'Groot',
      version: appVersion,
      purl: appRef,
      licenses: licenseEntry(packageManifest.license),
      ...(artifactEvidence
        ? { hashes: [{ alg: 'SHA-256', content: artifactEvidence.sha256 }] }
        : {}),
      properties: [
        { name: 'groot:commit', value: commit },
        { name: 'groot:rust-target', value: host },
        { name: 'groot:cargo-lock-sha256', value: lockSha256('src-tauri/Cargo.lock') },
        { name: 'groot:pnpm-lock-sha256', value: lockSha256('pnpm-lock.yaml') },
        { name: 'groot:npm-installed-package-count', value: String(installedNodePackages.size) },
        { name: 'groot:pnpm-lock-package-count', value: String(lockedNodePackages.size) },
        ...(artifactEvidence
          ? [{ name: 'groot:artifact-filename', value: artifactEvidence.filename }]
          : [])
      ]
    }
  },
  components,
  dependencies: [{ ref: appRef, dependsOn: components.map((component) => component['bom-ref']) }]
};

writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
console.log(`CycloneDX SBOM: ${components.length} locked components -> ${output}`);
