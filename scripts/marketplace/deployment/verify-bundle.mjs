import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function inventory(root) {
  const files = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error('Bundle symlinks are forbidden.');
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && stat.size <= 32 * 1024 * 1024) {
        if (relative(root, path) !== 'manifest.json')
          files.push({
            path: relative(root, path).split('\\').join('/'),
            bytes: stat.size,
            sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
          });
      } else throw new Error('Unsupported bundle file.');
      if (files.length > 5000) throw new Error('Bundle exceeds its file bound.');
    }
  };
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error('A regular bundle directory is required.');
  walk(root);
  return files;
}

export function verifyBundle(root) {
  const path = join(root, 'manifest.json');
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
    throw new Error('A regular bundle manifest is required.');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.mode !== 'sandbox' ||
    manifest.liveTrading !== false ||
    manifest.nodeVersion !== '24.19.0' ||
    JSON.stringify(inventory(root)) !== JSON.stringify(manifest.files)
  )
    throw new Error('Sandbox bundle integrity check failed.');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    verifyBundle(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
    console.log('Sandbox bundle inventory verified; this is integrity evidence, not a signature.');
  } catch {
    console.error('Sandbox bundle rejected. Inspect the trusted source and rebuild.');
    process.exitCode = 1;
  }
}
