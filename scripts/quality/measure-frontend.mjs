// Read-only production asset measurements; no dependency changes or wallet access.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { gzipSync } from 'node:zlib';
const root = resolve(process.argv[2] ?? '.svelte-kit/output/client');
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? files(path)
      : entry.isFile() && /\.(css|js)$/.test(entry.name)
        ? [path]
        : [];
  });
}
const assets = files(root).map((path) => ({
  path: relative(root, path),
  bytes: statSync(path).size,
  gzipBytes: gzipSync(readFileSync(path), { level: 9 }).length
}));
const totals = Object.fromEntries(
  ['css', 'js'].map((type) => {
    const selected = assets.filter((asset) => asset.path.endsWith('.' + type));
    return [
      type,
      {
        files: selected.length,
        bytes: selected.reduce((sum, x) => sum + x.bytes, 0),
        gzipBytes: selected.reduce((sum, x) => sum + x.gzipBytes, 0)
      }
    ];
  })
);
const report = {
  schemaVersion: 1,
  kind: 'production-client-assets',
  compression: 'gzip level 9 per file',
  runtime: {
    node: process.version,
    zlib: process.versions.zlib,
    platform: process.platform,
    arch: process.arch
  },
  totals,
  largest: assets.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 10)
};
if (process.argv[3]) {
  const baseline = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8'));
  if (
    baseline.schemaVersion !== 1 ||
    baseline.kind !== report.kind ||
    baseline.compression !== report.compression ||
    Object.entries(report.runtime).some(([key, value]) => baseline.runtime?.[key] !== value)
  )
    throw new Error('Incompatible asset baseline.');
  report.delta = Object.fromEntries(
    ['css', 'js'].map((type) => [
      type,
      {
        bytes: totals[type].bytes - baseline.totals[type].bytes,
        gzipBytes: totals[type].gzipBytes - baseline.totals[type].gzipBytes
      }
    ])
  );
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
