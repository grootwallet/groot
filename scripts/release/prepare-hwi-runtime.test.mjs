import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  copyHwiRuntime,
  readHwiRuntimeArchive,
  runtimeInventory,
  verifyHwiRuntime
} from './prepare-hwi-runtime.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function archive(name = 'Python', kind = 'n', contents = 'Python.framework/Versions/3.9/Python\0') {
  const entries = [
    [kind, name, Buffer.from(contents)],
    ['o', 'pyi-contents-directory _internal', Buffer.alloc(0)]
  ];
  let position = 0;
  const data = [];
  const toc = [];
  for (const [type, path, bytes] of entries) {
    const name = Buffer.from(`${path}\0`);
    const header = Buffer.alloc(18);
    header.writeUInt32BE(18 + name.length, 0);
    header.writeUInt32BE(position, 4);
    header.writeUInt32BE(bytes.length, 8);
    header.writeUInt32BE(bytes.length, 12);
    header[17] = type.charCodeAt(0);
    data.push(bytes);
    toc.push(header, name);
    position += bytes.length;
  }
  const table = Buffer.concat(toc);
  const cookie = Buffer.alloc(88);
  Buffer.from('4d45490c0b0a0b0e', 'hex').copy(cookie);
  cookie.writeUInt32BE(position + table.length + 88, 8);
  cookie.writeUInt32BE(position, 12);
  cookie.writeUInt32BE(table.length, 16);
  cookie.writeUInt32BE(309, 20);
  cookie.write('Python\0', 24);
  return Buffer.concat([Buffer.from('fixture bootloader'), ...data, table, cookie]);
}

test('archive extraction requires exact pinned bytes and bounded paths', () => {
  const bytes = archive();
  assert.equal(readHwiRuntimeArchive(bytes, digest(bytes))[0].name, 'Python');
  assert.throws(() => readHwiRuntimeArchive(bytes, '0'.repeat(64)));
  for (const name of ['../Python', '/Python', 'a/../Python', 'a//Python']) {
    const bytes = archive(name);
    assert.throws(() => readHwiRuntimeArchive(bytes, digest(bytes)));
  }
  const bytes2 = archive();
  bytes2.writeUInt32BE(0xffffffff, bytes2.length - 76);
  assert.throws(() => readHwiRuntimeArchive(bytes2, digest(bytes2)));
});

test('runtime inventory detects modified, extra and writable files and escaping links', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'groot-runtime-test-')));
  const copied = `${root}-copy`;
  try {
    writeFileSync(join(root, 'Python'), 'fixture', { mode: 0o644 });
    symlinkSync('Python', join(root, 'alias'));
    const inventory = runtimeInventory(root);
    const manifest = Buffer.from(
      JSON.stringify({ schemaVersion: 1, sourceSha256: 'source', ...inventory })
    );
    writeFileSync(join(root, 'runtime-manifest.json'), manifest);
    const check = () => verifyHwiRuntime(root, digest(manifest), 'source');
    assert.equal(check().fileCount, 1);
    assert.equal(copyHwiRuntime(root, copied, digest(manifest), 'source').linkCount, 1);
    assert.throws(() => copyHwiRuntime(root, copied, digest(manifest), 'source'));
    assert.throws(() => copyHwiRuntime(root, `${copied}-invalid`, '0'.repeat(64), 'source'));
    writeFileSync(join(root, 'Python'), 'changed');
    assert.throws(check);
    writeFileSync(join(root, 'Python'), 'fixture');
    writeFileSync(join(root, 'extra'), 'injected');
    assert.throws(check);
    rmSync(join(root, 'extra'));
    chmodSync(join(root, 'Python'), 0o666);
    assert.throws(check);
    chmodSync(join(root, 'Python'), 0o644);
    rmSync(join(root, 'alias'));
    symlinkSync('/etc/hosts', join(root, 'alias'));
    assert.throws(check);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(copied, { recursive: true, force: true });
  }
});
