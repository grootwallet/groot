import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('source watcher enumerates the same repository paths from the native crate', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'groot-source-watch-')));
  try {
    // Compile the actual std-only functions, not a JavaScript copy of their rules.
    const source = readFileSync(resolve('src-tauri/build.rs'), 'utf8');
    const functionSource = (name) => {
      const start = source.indexOf(`fn ${name}(`);
      assert.ok(start >= 0, `Missing ${name}`);
      const next = source.indexOf('\nfn ', start + 1);
      return source.slice(start, next < 0 ? undefined : next);
    };
    const harness = join(directory, 'watcher.rs');
    const executable = join(directory, 'watcher');
    writeFileSync(
      harness,
      `${functionSource('git_output')}\n${functionSource('watch_repository_sources')}\nfn main() { watch_repository_sources(); }\n`
    );
    execFileSync('rustc', [
      '--edition=2021',
      '--crate-name',
      'source_watch_fixture',
      harness,
      '-o',
      executable
    ]);
    const root = join(directory, 'repository with spaces');
    mkdirSync(root);
    execFileSync('git', ['init', '--quiet', root]);
    const tracked = [
      'src-tauri/Cargo.toml',
      'src-tauri/build.rs',
      'src/routes/+page.svelte',
      'docs/file with spaces.md',
      '.gitignore'
    ];
    for (const path of tracked) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), path === '.gitignore' ? 'ignored.tmp\n' : 'synthetic\n');
    }
    execFileSync('git', ['-C', root, 'add', '--', ...tracked]);
    writeFileSync(join(root, 'src', 'untracked.txt'), 'synthetic\n');
    writeFileSync(join(root, 'ignored.tmp'), 'synthetic\n');
    const observe = (cwd) =>
      new Set(execFileSync(executable, [], { cwd, encoding: 'utf8' }).trimEnd().split('\n'));
    const rootPaths = observe(root);
    const nativePaths = observe(join(root, 'src-tauri'));
    assert.deepEqual(nativePaths, rootPaths);
    for (const path of [...tracked, 'src/untracked.txt']) {
      assert.ok(nativePaths.has(`cargo:rerun-if-changed=${root}/${path}`), `Missing ${path}`);
    }
    for (const path of ['Cargo.toml', 'build.rs', 'ignored.tmp']) {
      assert.ok(!nativePaths.has(`cargo:rerun-if-changed=${root}/${path}`), `Unexpected ${path}`);
    }
    // Parent-directory watches are deliberately retained, including recursive
    // Cargo observation of ignored children; only individual enumeration excludes them.
    assert.ok(nativePaths.has(`cargo:rerun-if-changed=${root}/src-tauri`));
    assert.ok(nativePaths.has(`cargo:rerun-if-changed=${root}/src`));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
