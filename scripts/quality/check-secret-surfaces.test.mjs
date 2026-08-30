import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { approvedCapabilityPermissions } from './check-secret-surfaces.mjs';

const approved = JSON.stringify({
  permissions: ['core:default', 'clipboard-manager:allow-write-text']
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'groot-capabilities-'));
  writeFileSync(join(directory, 'default.json'), approved);
  return directory;
}

function rejectsExtra(name, arrange) {
  test(name, () => {
    const directory = fixture();
    try {
      arrange(directory);
      assert.throws(
        () => approvedCapabilityPermissions(directory),
        /must contain only the reviewed regular file default\.json/
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('accepts only the reviewed default capability', () => {
  const directory = fixture();
  try {
    assert.deepEqual([...approvedCapabilityPermissions(directory)].sort(), [
      'clipboard-manager:allow-write-text',
      'core:default'
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

rejectsExtra('rejects a second top-level JSON capability', (directory) => {
  writeFileSync(join(directory, 'extra.json'), approved);
});

rejectsExtra('rejects a nested capability directory', (directory) => {
  const nested = join(directory, 'nested');
  mkdirSync(nested);
  writeFileSync(join(nested, 'extra.json'), approved);
});

rejectsExtra('rejects an alternate TOML capability', (directory) => {
  writeFileSync(
    join(directory, 'extra.toml'),
    'permissions = ["clipboard-manager:allow-read-text"]'
  );
});
