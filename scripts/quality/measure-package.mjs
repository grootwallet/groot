// Read-only attribution of a built macOS app. Embedded frontend bytes are already
// part of the native executable; do not add the separate asset report to this sum.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2] ?? '');
if (!root.endsWith('.app') || !statSync(join(root, 'Contents')).isDirectory()) {
  throw new Error('Provide a built .app directory.');
}
const files = [];
const links = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = relative(root, path);
    if (entry.isSymbolicLink()) links.push(name);
    else if (entry.isDirectory()) visit(path);
    else if (entry.isFile()) {
      const category = name.startsWith('Contents/MacOS/')
        ? 'native-executable-including-embedded-assets'
        : /(?:^|\/)(?:hwi|hwi-runtime)(?:\/|$)/.test(name)
          ? 'hardware-signer-runtime'
          : /(?:LICENSE|NOTICE|THIRD_PARTY)/.test(name)
            ? 'licenses-and-notices'
            : /\.(?:icns|ico|png|svg|woff2?)$/.test(name)
              ? 'images-and-fonts'
              : 'other-packaged-resources';
      files.push({ path: name, category, bytes: statSync(path).size });
    }
  }
}
visit(root);
const totals = {};
for (const file of files) totals[file.category] = (totals[file.category] ?? 0) + file.bytes;
const native = files
  .filter((file) => file.category.startsWith('native-executable'))
  .map((file) => ({
    ...file,
    sha256: createHash('sha256')
      .update(readFileSync(join(root, file.path)))
      .digest('hex')
  }));
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'macos-package-file-attribution',
      method:
        'regular-file bytes; symlinks excluded; disk allocation and download compression differ',
      sourceCommit: process.env.GROOT_MEASUREMENT_COMMIT ?? 'unrecorded',
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      totals,
      native,
      fileCount: files.length,
      symlinkCount: links.length,
      largest: files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 15)
    },
    null,
    2
  )
);
