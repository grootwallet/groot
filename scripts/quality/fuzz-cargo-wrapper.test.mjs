import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync, symlinkSync } from 'node:fs';
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

test('rejects a target corpus symlink back into the repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'groot-fuzz-corpus-boundary-'));
  try {
    const repository = join(directory, 'repository');
    const scripts = join(repository, 'scripts', 'quality');
    const corpus = join(directory, 'external-corpus');
    const tools = join(directory, 'tools');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(join(repository, 'fuzz', 'corpus', 'psbt_roundtrip'), { recursive: true });
    mkdirSync(corpus);
    mkdirSync(tools);
    copyFileSync(resolve('scripts/quality/fuzz-parsers.sh'), join(scripts, 'fuzz-parsers.sh'));
    writeFileSync(join(tools, 'cargo-fuzz'), '#!/bin/sh\nprintf "cargo-fuzz 0.13.2\\n"\n', {
      mode: 0o700
    });
    symlinkSync(
      join(repository, 'fuzz', 'corpus', 'psbt_roundtrip'),
      join(corpus, 'psbt_roundtrip')
    );
    const result = spawnSync(
      'bash',
      [join(scripts, 'fuzz-parsers.sh'), 'psbt_roundtrip', '-runs=1'],
      {
        encoding: 'utf8',
        env: {
          PATH: `${tools}:/usr/bin:/bin`,
          GROOT_FUZZ_TARGET_DIR: join(directory, 'external-cache'),
          GROOT_FUZZ_CORPUS_DIR: corpus
        }
      }
    );
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Active target corpus must be outside the repository/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
