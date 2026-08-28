import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { mutateSignedPsbt } from './mutate-signed-psbt.mjs';

function compact(value) {
  assert(value < 0xfd);
  return Buffer.from([value]);
}

function entry(key, value) {
  return Buffer.concat([compact(key.length), key, compact(value.length), value]);
}

function signedFixture() {
  const transaction = Buffer.concat([
    Buffer.from('02000000', 'hex'),
    Buffer.from([1]),
    Buffer.alloc(32),
    Buffer.from('00000000', 'hex'),
    Buffer.from([0]),
    Buffer.from('fdffffff', 'hex'),
    Buffer.from([1]),
    Buffer.alloc(8),
    Buffer.from([0]),
    Buffer.from('00000000', 'hex')
  ]);
  const r = Buffer.alloc(32, 1);
  const s = Buffer.alloc(32, 2);
  const signature = Buffer.concat([
    Buffer.from([0x30, 0x44, 0x02, 0x20]),
    r,
    Buffer.from([0x02, 0x20]),
    s,
    Buffer.from([1])
  ]);
  return Buffer.concat([
    Buffer.from('70736274ff', 'hex'),
    entry(Buffer.from([0]), transaction),
    Buffer.from([0]),
    entry(Buffer.concat([Buffer.from([2]), Buffer.alloc(33, 3)]), signature),
    Buffer.from([0, 0])
  ]);
}

test('mutates exactly one signature byte and preserves binary/base64 representation', () => {
  const source = signedFixture();
  const binary = mutateSignedPsbt(source);
  assert.equal(binary.length, source.length);
  assert.equal([...binary].filter((byte, index) => byte !== source[index]).length, 1);

  const base64 = Buffer.from(`${source.toString('base64')}\n`);
  const mutatedText = mutateSignedPsbt(base64);
  assert.match(mutatedText.toString(), /^[A-Za-z0-9+/=]+\n$/);
  const decoded = Buffer.from(mutatedText.toString().trim(), 'base64');
  assert.equal([...decoded].filter((byte, index) => byte !== source[index]).length, 1);
});

test('refuses unsigned input and never overwrites an existing output', async () => {
  const unsigned = signedFixture();
  const signatureType = unsigned.indexOf(
    Buffer.concat([Buffer.from([0x22, 0x02]), Buffer.alloc(33, 3)])
  );
  unsigned[signatureType + 1] = 3;
  assert.throws(() => mutateSignedPsbt(unsigned), /no partial signature/);

  const directory = mkdtempSync(join(tmpdir(), 'groot-hostile-'));
  const input = join(directory, 'signed.psbt');
  const output = join(directory, 'existing.psbt');
  writeFileSync(input, signedFixture(), { mode: 0o600 });
  writeFileSync(output, 'keep', { mode: 0o600 });
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath,
    [
      new URL('./mutate-signed-psbt.mjs', import.meta.url).pathname,
      '--input',
      input,
      '--output',
      output
    ],
    { encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(output, 'utf8'), 'keep');
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /70736274|cHNidP|signed\.psbt/);
});
