import { readFile } from 'node:fs/promises';

const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'));
const tauriMetadata = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const cargoManifest = await readFile('src-tauri/Cargo.toml', 'utf8');
const frontendConfig = await readFile('src/lib/config.ts', 'utf8');

const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const frontendVersion = frontendConfig.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
const versions = new Map([
  ['package.json', packageMetadata.version],
  ['src-tauri/tauri.conf.json', tauriMetadata.version],
  ['src-tauri/Cargo.toml', cargoVersion],
  ['src/lib/config.ts', frontendVersion]
]);

for (const [surface, version] of versions) {
  if (!version) throw new Error(`Version gate failed: ${surface} has no readable version.`);
}

const expectedVersion = packageMetadata.version;
const mismatches = [...versions].filter(([, version]) => version !== expectedVersion);
if (mismatches.length > 0) {
  throw new Error(
    `Version gate failed: expected ${expectedVersion}; ${mismatches
      .map(([surface, version]) => `${surface}=${version}`)
      .join(', ')}.`
  );
}

if (!/^0\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error(`Version gate failed: ${expectedVersion} is not a pre-1.0 semantic version.`);
}

console.log(`Version surface gate: all release surfaces use v${expectedVersion}.`);
