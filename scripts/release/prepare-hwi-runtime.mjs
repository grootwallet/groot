// ADRs 0098/0104: sealed HWI runtime; no vendor code changes.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import {
  cpSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAGIC = Buffer.from('4d45490c0b0a0b0e', 'hex');
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 256;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => {
  throw new Error('Invalid pinned HWI runtime package');
};
const safePath = (name) =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length < 512 &&
  /^[A-Za-z0-9_./+-]+$/.test(name) &&
  !isAbsolute(name) &&
  name.split('/').every((part) => part && part !== '.' && part !== '..');

// Reads data only. Never imports or executes any Python from the archive.
export function readHwiRuntimeArchive(bytes, expectedDigest, session = false) {
  if (
    bytes.length > MAX_BYTES ||
    !/^[a-f0-9]{64}$/.test(expectedDigest) ||
    sha256(bytes) !== expectedDigest
  )
    fail();
  const cookie = bytes.lastIndexOf(MAGIC);
  if (cookie < 0 || cookie + 88 > bytes.length) fail();
  const size = bytes.readUInt32BE(cookie + 8);
  const tocOffset = bytes.readUInt32BE(cookie + 12);
  const tocLength = bytes.readUInt32BE(cookie + 16);
  const start = cookie + 88 - size;
  if (
    start < 0 ||
    tocOffset + tocLength !== size - 88 ||
    bytes.readUInt32BE(cookie + 20) !== 309 ||
    bytes.subarray(cookie + 24, cookie + 31).toString() !== 'Python\0'
  )
    fail();
  const toc = bytes.subarray(start + tocOffset, start + tocOffset + tocLength);
  const entries = [];
  const names = new Set();
  let offset = 0;
  let expanded = 0;
  let contentsDirectory = false;
  while (offset < toc.length) {
    if (offset + 18 > toc.length || entries.length >= MAX_ENTRIES) fail();
    const length = toc.readUInt32BE(offset);
    const position = toc.readUInt32BE(offset + 4);
    const compressedLength = toc.readUInt32BE(offset + 8);
    const originalLength = toc.readUInt32BE(offset + 12);
    const compression = toc[offset + 16];
    const kind = String.fromCharCode(toc[offset + 17]);
    if (
      length < 19 ||
      offset + length > toc.length ||
      position + compressedLength > tocOffset ||
      originalLength > MAX_BYTES ||
      ![0, 1].includes(compression) ||
      !'msbnoxz'.includes(kind)
    )
      fail();
    const nameBytes = toc.subarray(offset + 18, offset + length);
    const terminator = nameBytes.indexOf(0);
    if (terminator < 0 || nameBytes.subarray(terminator).some((byte) => byte !== 0)) fail();
    const name = nameBytes.subarray(0, terminator).toString('utf8');
    offset += length;
    if (kind === 'o') {
      if (name !== 'pyi-contents-directory _internal') fail();
      contentsDirectory = true;
      continue;
    }
    if (!safePath(name) || names.has(name)) fail();
    names.add(name);
    const bootstrap =
      session &&
      ((kind === 'm' &&
        ['struct', 'pyimod01_archive', 'pyimod02_importers', 'pyimod03_ctypes'].includes(name)) ||
        (kind === 'z' && name === 'PYZ-00.pyz'));
    if (!'bxn'.includes(kind) && !bootstrap) continue;
    const compressed = bytes.subarray(start + position, start + position + compressedLength);
    const data = compression ? inflateSync(compressed, { maxOutputLength: MAX_BYTES }) : compressed;
    expanded += data.length;
    if (data.length !== originalLength || expanded > MAX_BYTES) fail();
    entries.push({ name, kind, data });
  }
  if (!contentsDirectory || !entries.some((entry) => entry.name === 'Python' && entry.kind === 'n'))
    fail();
  return entries;
}

export function runtimeInventory(root) {
  if (
    realpathSync(root) !== resolve(root) ||
    !lstatSync(root).isDirectory() ||
    lstatSync(root).mode & 0o022
  )
    fail();
  const files = [];
  const links = [];
  let total = 0;
  let visited = 0;
  function visit(directory) {
    if (relative(root, directory).split('/').length > 16) fail();
    for (const name of readdirSync(directory).sort()) {
      if (++visited > MAX_ENTRIES * 2) fail();
      const path = join(directory, name);
      const rel = relative(root, path).split('\\').join('/');
      if (!safePath(rel)) fail();
      const stat = lstatSync(path);
      // POSIX symlink mode bits are not enforced (Linux reports 0777). Verify
      // the link target below; permissions matter for files and directories.
      if (!stat.isSymbolicLink() && stat.mode & 0o022) fail();
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(path);
        if (!safePath(target) || !realpathSync(path).startsWith(`${realpathSync(root)}/`)) fail();
        links.push({ path: rel, target });
      } else if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) {
        if (rel === 'runtime-manifest.json') continue;
        total += stat.size;
        if (total > MAX_BYTES || stat.size > MAX_BYTES) fail();
        files.push({ path: rel, size: stat.size, sha256: sha256(readFileSync(path)) });
      } else fail();
      if (files.length + links.length > MAX_ENTRIES) fail();
    }
  }
  visit(root);
  return {
    files: files.sort((a, b) => a.path.localeCompare(b.path, 'en')),
    links: links.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  };
}

const machoMagic = new Set(['cffaedfe', 'feedfacf', 'cafebabe', 'bebafeca']);

function runtimeMachOPaths(root) {
  return runtimeInventory(root)
    .files.filter(({ path }) =>
      machoMagic.has(readFileSync(join(root, path)).subarray(0, 4).toString('hex'))
    )
    .map(({ path }) => path);
}

function signProductionRuntime(root, identity) {
  if (!identity || /[\r\n]/.test(identity)) fail();
  const binaries = runtimeMachOPaths(root);
  if (
    !binaries.includes('groot-hwi-session') ||
    !binaries.includes('Python.framework/Versions/3.9/Python')
  )
    fail();
  for (const path of binaries.filter((path) => !path.startsWith('Python.framework/'))) {
    execFileSync(
      '/usr/bin/codesign',
      ['--force', '--sign', identity, '--options', 'runtime', '--timestamp', join(root, path)],
      { stdio: 'pipe' }
    );
  }
  execFileSync(
    '/usr/bin/codesign',
    [
      '--force',
      '--sign',
      identity,
      '--options',
      'runtime',
      '--timestamp',
      join(root, 'Python.framework')
    ],
    { stdio: 'pipe' }
  );
}

export function prepareHwiRuntime(source, output, expectedDigest, session = false, identity) {
  if (
    process.platform !== 'darwin' ||
    process.arch !== 'arm64' ||
    existsSync(output) ||
    !lstatSync(source).isFile() ||
    lstatSync(source).isSymbolicLink()
  )
    fail();
  const entries = readHwiRuntimeArchive(readFileSync(source), expectedDigest, session);
  mkdirSync(output, { recursive: true, mode: 0o755 });
  for (const entry of entries.filter((entry) => entry.kind !== 'n')) {
    const path = join(output, entry.name);
    mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
    writeFileSync(path, entry.data, { flag: 'wx', mode: entry.kind === 'b' ? 0o755 : 0o644 });
    chmodSync(path, entry.kind === 'b' ? 0o755 : 0o644);
  }
  for (const entry of entries.filter((entry) => entry.kind === 'n')) {
    const target = entry.data.toString('utf8').replace(/\0$/, '');
    if (!safePath(target)) fail();
    const path = join(output, entry.name);
    mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
    symlinkSync(target, path);
  }
  // The one-file payload omits the framework resource seal. Internal RCs
  // restore it ad hoc; production signs every extracted Mach-O with the
  // reviewed Developer ID before the runtime manifest is frozen.
  if (!identity) {
    execFileSync(
      '/usr/bin/codesign',
      ['--force', '--sign', '-', '--timestamp=none', join(output, 'Python.framework')],
      { stdio: 'pipe' }
    );
    execFileSync('/usr/bin/codesign', ['--verify', '--strict', join(output, 'Python.framework')], {
      stdio: 'pipe'
    });
  }
  if (session) {
    for (const name of [
      'struct',
      'pyimod01_archive',
      'pyimod02_importers',
      'pyimod03_ctypes',
      'PYZ-00.pyz'
    ]) {
      if (!entries.some((entry) => entry.name === name)) fail();
    }
    const helperSource = fileURLToPath(new URL('../hardware/', import.meta.url));
    for (const [sourceName, targetName] of [
      ['session-bootstrap.py', 'groot-session.py'],
      ['session-worker.py', 'groot-session-worker.py']
    ]) {
      writeFileSync(join(output, targetName), readFileSync(join(helperSource, sourceName)), {
        flag: 'wx',
        mode: 0o644
      });
    }
    execFileSync(
      '/usr/bin/clang',
      [
        '-O2',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-o',
        join(output, 'groot-hwi-session'),
        join(helperSource, 'session-launcher.c')
      ],
      { stdio: 'pipe' }
    );
    chmodSync(join(output, 'groot-hwi-session'), 0o755);
    if (!identity) {
      execFileSync(
        '/usr/bin/codesign',
        ['--force', '--sign', '-', '--timestamp=none', join(output, 'groot-hwi-session')],
        { stdio: 'pipe' }
      );
      execFileSync(
        '/usr/bin/codesign',
        ['--verify', '--strict', join(output, 'groot-hwi-session')],
        {
          stdio: 'pipe'
        }
      );
    }
  }
  if (identity) {
    if (!session) fail();
    signProductionRuntime(output, identity);
  }
  const manifest = { schemaVersion: 1, sourceSha256: expectedDigest, ...runtimeInventory(output) };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(output, 'runtime-manifest.json'), bytes, { flag: 'wx', mode: 0o644 });
  return {
    sha256: sha256(bytes),
    fileCount: manifest.files.length,
    linkCount: manifest.links.length
  };
}

export function verifyHwiRuntime(root, expectedDigest, sourceDigest) {
  const manifestPath = join(root, 'runtime-manifest.json');
  if (!lstatSync(manifestPath).isFile() || lstatSync(manifestPath).size > 128 * 1024) fail();
  const bytes = readFileSync(manifestPath);
  if (bytes.length > 128 * 1024 || sha256(bytes) !== expectedDigest) fail();
  const manifest = JSON.parse(bytes);
  const inventory = runtimeInventory(root);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.sourceSha256 !== sourceDigest ||
    JSON.stringify(inventory.files) !== JSON.stringify(manifest.files) ||
    JSON.stringify(inventory.links) !== JSON.stringify(manifest.links)
  )
    fail();
  return { fileCount: inventory.files.length, linkCount: inventory.links.length };
}

export function verifyProductionHwiRuntime(root, expectedDigest, sourceDigest, teamId) {
  if (!/^[A-Z0-9]{10}$/.test(teamId ?? '') || teamId !== '6Z85HGDUU7') fail();
  const result = verifyHwiRuntime(root, expectedDigest, sourceDigest);
  const binaries = runtimeMachOPaths(root);
  if (
    !binaries.includes('groot-hwi-session') ||
    !binaries.includes('Python.framework/Versions/3.9/Python')
  )
    fail();
  for (const path of binaries) {
    const absolute = join(root, path);
    execFileSync('/usr/bin/codesign', ['--verify', '--strict', absolute], { stdio: 'pipe' });
    const inspection = spawnSync('/usr/bin/codesign', ['--display', '--verbose=4', absolute], {
      encoding: 'utf8'
    });
    if (inspection.status !== 0) fail();
    const details = `${inspection.stdout ?? ''}\n${inspection.stderr ?? ''}`;
    validateProductionRuntimeSignature(details, teamId);
  }
  execFileSync(
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', join(root, 'Python.framework')],
    {
      stdio: 'pipe'
    }
  );
  return result;
}

export function validateProductionRuntimeSignature(details, teamId) {
  if (
    !/^[A-Z0-9]{10}$/.test(teamId ?? '') ||
    !new RegExp(`^TeamIdentifier=${teamId}$`, 'm').test(details) ||
    !/^Authority=Developer ID Application:.+$/m.test(details) ||
    !/^Timestamp=(?!none$).+/m.test(details) ||
    !/flags=.*\bruntime\b/.test(details)
  )
    fail();
}

export function copyHwiRuntime(source, output, expectedDigest, sourceDigest) {
  verifyHwiRuntime(source, expectedDigest, sourceDigest);
  if (existsSync(output)) fail();
  cpSync(source, output, {
    recursive: true,
    verbatimSymlinks: true,
    force: false,
    errorOnExist: true
  });
  return verifyHwiRuntime(output, expectedDigest, sourceDigest);
}
