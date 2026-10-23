import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const wrapper = resolve('fuzz/tools/cargo');
for (const subcommand of ['build', 'run']) {
  test(`locks cargo ${subcommand} before program arguments`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'groot-fuzz-wrapper-'));
    try {
      writeFileSync(join(directory, 'rustup'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', {
        mode: 0o700
      });
      const args = ['--manifest-path', 'synthetic path/Cargo.toml'];
      if (subcommand === 'run') args.push('--', '-runs=1', 'synthetic corpus');
      const result = spawnSync(wrapper, [subcommand, ...args], {
        encoding: 'utf8',
        env: { PATH: `${directory}:/usr/bin:/bin` }
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.stdout.trimEnd().split('\n'), [
        'run',
        'nightly-2026-10-22',
        'cargo',
        subcommand,
        '--locked',
        ...args
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
test('rejects unreviewed Cargo subcommands', () => {
  const result = spawnSync(wrapper, ['install', 'unreviewed'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /only build and run/);
});
