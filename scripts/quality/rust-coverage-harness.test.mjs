import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const libraryScenarios = [
  'funded_regtest_reorg_restart_reanchor_and_false_positive_are_consistent',
  'funded_rbf_and_cpfp_cross_groot_proposal_boundaries',
  'funded_mobile_cosigner_round_trip_reviews_merges_finalizes_and_broadcasts',
  'clean_storage_descriptor_recovery_restores_known_history_and_survives_reopen',
  'current_tip_initial_scan_allows_later_bitcoin_core_sync',
  'explicit_rescan_waits_when_core_falls_behind_the_wallet_checkpoint',
  'birthday_only_checkpoint_recovers_after_a_deep_reorg',
  'existing_wallet_can_repeat_full_rescan_from_an_earlier_birthday',
  'funded_delayed_policy_tracks_each_coin_restarts_and_rearms_after_reorg',
  'funded_continuity_all_named_paths_renew_reorg_and_restore',
  'funded_continuity_descriptors_restore_history_in_core'
];
const descriptorScenarios = [
  'bitcoin_core_imports_groot_descriptors_and_recovers_funded_history',
  'funds_builds_signs_and_broadcasts_a_real_two_of_three_psbt',
  'birthday_and_gap_limits_omit_then_restore_known_history',
  'extended_gap_large_history_recovers_within_the_ci_resource_envelope'
];
const fixtureScripts = [
  'scripts/quality/check-rust-coverage.sh',
  'scripts/quality/check-rust-full-coverage.sh',
  'scripts/regtest/test.sh'
];
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
// This shell harness owns the Linux/macOS LLVM/Core lane. Windows still runs
// both source inventories below; Linux CI executes every command fixture.
const testBash = (name, run) =>
  test(
    name,
    {
      skip:
        process.platform === 'win32'
          ? 'The LLVM/Core command harness requires a Unix host and runs fully in Linux CI.'
          : false
    },
    run
  );

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'groot-coverage-harness-'));
  const repository = join(directory, 'repository');
  const tools = join(directory, 'tools');
  const log = join(directory, 'commands.jsonl');
  mkdirSync(tools);
  mkdirSync(join(repository, 'src-tauri', 'src'), { recursive: true });
  for (const file of fixtureScripts) {
    mkdirSync(join(repository, file, '..'), { recursive: true });
    copyFileSync(resolve(file), join(repository, file));
  }
  for (const file of readdirSync(resolve('src-tauri/src')).filter((file) => file.endsWith('.rs'))) {
    writeFileSync(join(repository, 'src-tauri', 'src', file), '');
  }
  const stub = join(directory, 'stub.sh');
  writeFileSync(
    stub,
    `#!/bin/bash
kind="$1"
shift
phase="$kind"
if [[ "$kind" == cargo ]]; then
  phase=units
  for arg in "$@"; do
    [[ "$arg" == --ignored ]] && phase=scenario
  done
  if [[ "\${2:-}" == clean ]]; then
    phase=clean
  elif [[ "\${2:-}" == report ]]; then
    phase=all-report
    for arg in "$@"; do
      [[ "$arg" == --ignore-filename-regex ]] && phase=core-report
    done
  fi
fi
printf '%s\\0' "$kind" "$phase" "\${CARGO_TARGET_DIR:-}" "\${CARGO_LLVM_COV_TARGET_DIR:-}" \\
  "\${GROOT_REGTEST_DIR:-}" "\${GROOT_RUN_REGTEST:-}" "\${GROOT_COMPACT_FILTER_TEST_PEER:-}" "$#" "$@" >> "$GROOT_STUB_LOG"
if [[ -n "\${GROOT_STUB_FAIL:-}" ]]; then
  [[ "$GROOT_STUB_FAIL" == "$phase" ]] && exit 17
  for arg in "$@"; do
    [[ "$GROOT_STUB_FAIL" == "$arg" ]] && exit 17
  done
fi
exit 0
`
  );
  writeFileSync(join(tools, 'cargo'), `#!/bin/bash\nexec /bin/bash ${quote(stub)} cargo "$@"\n`, {
    mode: 0o700
  });
  for (const action of ['start', 'stop']) {
    writeFileSync(
      join(repository, 'scripts', 'regtest', `${action}.sh`),
      `#!/bin/bash\n/bin/bash ${quote(stub)} core-${action}\n`
    );
  }
  return {
    directory,
    repository,
    run(script = 'scripts/quality/check-rust-full-coverage.sh', env = {}) {
      const result = spawnSync('/bin/bash', [join(repository, script)], {
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          PATH: `${tools}:/usr/bin:/bin`,
          TMPDIR: directory,
          GROOT_STUB_LOG: log,
          GROOT_RPC_PORT: '18443',
          GROOT_P2P_PORT: '18444',
          ...env
        }
      });
      const events = [];
      const fields = existsSync(log) ? readFileSync(log, 'utf8').split('\0') : [];
      while (fields.length > 1) {
        const [kind, phase, target, coverage, regtest, runRegtest, compactPeer, count] =
          fields.splice(0, 8);
        const args = fields.splice(0, Number(count));
        events.push({ kind, phase, target, coverage, regtest, runRegtest, compactPeer, args });
      }
      return { result, events };
    },
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

function withFixture(callback) {
  const current = fixture();
  try {
    callback(current);
  } finally {
    current.cleanup();
  }
}

function scenarios(events) {
  return events.filter(({ phase }) => phase === 'scenario');
}
function assertThresholds(event, lines, functions, regions) {
  const value = (flag) => event.args[event.args.indexOf(flag) + 1];
  assert.equal(value('--fail-under-lines'), String(lines));
  assert.equal(value('--fail-under-functions'), String(functions));
  assert.equal(value('--fail-under-regions'), String(regions));
}

testBash(
  'full lane gates deterministic units before appending every Core scenario exactly once',
  () => {
    withFixture(({ run, repository }) => {
      const { result, events } = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        events.slice(0, 4).map(({ phase }) => phase),
        ['clean', 'units', 'core-report', 'core-start']
      );
      assert.equal(events.at(-1).phase, 'all-report');
      assert.equal(events.filter(({ phase }) => phase === 'units').length, 1);
      assert.equal(events.filter(({ phase }) => phase === 'clean').length, 1);
      assertThresholds(events[2], 99, 100, 97);
      assertThresholds(events.at(-1), 62, 59, 59);
      const calls = scenarios(events);
      assert.equal(calls.length, 12);
      assert.deepEqual(
        calls
          .filter(({ args }) => args.includes('--lib'))
          .map(({ args }) => args[args.indexOf('--') + 1]),
        libraryScenarios
      );
      assert.equal(calls.filter(({ args }) => args.includes('regtest_multisig')).length, 1);
      assert.equal(calls[0].compactPeer, '127.0.0.1:18444');
      assert.ok(calls.slice(1).every(({ runRegtest }) => runRegtest === '1'));
      for (const event of events.filter(({ kind }) => kind === 'cargo')) {
        assert.ok(event.args.includes('--locked'));
        assert.equal(event.coverage, join(repository, 'src-tauri', 'target', 'llvm-cov-target'));
      }
      for (const { args } of calls) {
        assert.equal(args.includes('--no-clean'), false);
        assert.ok(args.includes('--no-report'));
        assert.deepEqual(args.slice(-3), ['--ignored', '--nocapture', '--test-threads=1']);
      }
      const stops = events.filter(({ phase }) => phase === 'core-stop');
      const starts = events.filter(({ phase }) => phase === 'core-start');
      assert.equal(starts.length, 2);
      assert.equal(stops.length, 2);
      assert.notEqual(starts[0].regtest, starts[1].regtest);
      for (const { regtest } of starts) assert.equal(existsSync(regtest), false);
    });
  }
);

test('every named library Core scenario remains a real explicitly ignored Rust test', () => {
  const sourceDirectory = resolve('src-tauri/src');
  const source = readdirSync(sourceDirectory, { recursive: true })
    .filter((file) => file.endsWith('.rs'))
    .map((file) => readFileSync(join(sourceDirectory, file), 'utf8'))
    .join('\n');
  const names = [...source.matchAll(/#\[test\]\s*#\[ignore[^\n]*\]\s*fn (\w+)\(/g)].map(
    (match) => match[1]
  );
  for (const scenario of libraryScenarios) {
    assert.equal(names.filter((name) => name === scenario).length, 1, scenario);
  }
});

test('descriptor integration invocation retains its four independently named scenarios', () => {
  const source = readFileSync(resolve('src-tauri/tests/regtest_multisig.rs'), 'utf8');
  const names = [...source.matchAll(/#\[test\]\s*#\[ignore[^\n]*\]\s*fn (\w+)\(/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(names, descriptorScenarios);
  assert.equal(libraryScenarios.length + names.length, 15);
});

for (const phase of ['clean', 'units', 'core-report']) {
  testBash(
    `${phase} failure stops before starting Core or publishing whole-library coverage`,
    () => {
      withFixture(({ run }) => {
        const { result, events } = run(undefined, { GROOT_STUB_FAIL: phase });
        assert.equal(result.status, 17, result.stderr);
        assert.equal(events.at(-1).phase, phase);
        assert.equal(
          events.some(({ phase }) => phase === 'core-start' || phase === 'all-report'),
          false
        );
      });
    }
  );
}

for (const name of [...libraryScenarios, 'regtest_multisig']) {
  testBash(
    `${name} failure stops the lane, cleans its Core fixture and withholds the final report`,
    () => {
      withFixture(({ run }) => {
        const { result, events } = run(undefined, { GROOT_STUB_FAIL: name });
        assert.equal(result.status, 17, result.stderr);
        assert.equal(events.at(-1).phase, 'core-stop');
        assert.equal(
          events.some(({ phase }) => phase === 'all-report'),
          false
        );
        for (const event of events.filter(({ phase }) => phase === 'core-start')) {
          assert.equal(existsSync(event.regtest), false);
        }
        assert.equal(scenarios(events).at(-1).args.includes(name), true);
      });
    }
  );
}

testBash('whole-library threshold failure remains a failure after every Core scenario', () => {
  withFixture(({ run }) => {
    const { result, events } = run(undefined, { GROOT_STUB_FAIL: 'all-report' });
    assert.equal(result.status, 17, result.stderr);
    assert.equal(scenarios(events).length, 12);
    assert.equal(events.at(-1).phase, 'all-report');
  });
});

testBash('a standalone core gate starts fresh and never calls Core', () => {
  withFixture(({ run }) => {
    const { result, events } = run('scripts/quality/check-rust-coverage.sh');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      events.map(({ phase }) => phase),
      ['clean', 'units', 'core-report']
    );
  });
});

for (const missing of [false, true]) {
  testBash(
    `coverage rejects ${missing ? 'a missing classified' : 'an unclassified new'} module before any Cargo call`,
    () => {
      withFixture(({ run, repository }) => {
        const file = join(repository, 'src-tauri', 'src', missing ? 'auth.rs' : 'unclassified.rs');
        if (missing) rmSync(file);
        else writeFileSync(file, '');
        const { result, events } = run();
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /Rust coverage scope failed/);
        assert.deepEqual(events, []);
      });
    }
  );
}

testBash('custom ordinary target directory stays separate from the coverage workspace', () => {
  withFixture(({ run, directory }) => {
    const ordinary = join(directory, 'ordinary target');
    const { result, events } = run(undefined, { CARGO_TARGET_DIR: ordinary });
    assert.equal(result.status, 0, result.stderr);
    for (const event of events.filter(({ kind }) => kind === 'cargo')) {
      assert.equal(event.target, ordinary);
      assert.equal(event.coverage, join(ordinary, 'llvm-cov-target'));
      assert.equal(event.args.includes('clean') && event.args[0] !== 'llvm-cov', false);
    }
  });
});

testBash('an explicit instrumented target is reused across both reports and every scenario', () => {
  withFixture(({ run, directory }) => {
    const target = join(directory, 'instrumented target');
    const { result, events } = run(undefined, { CARGO_LLVM_COV_TARGET_DIR: target });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      events.filter(({ kind }) => kind === 'cargo').every(({ coverage }) => coverage === target)
    );
  });
});

testBash(
  'ordinary Core mode preserves locked tests, Continuity optimization and package-only cleanup',
  () => {
    withFixture(({ run }) => {
      const { result, events } = run('scripts/regtest/test.sh');
      assert.equal(result.status, 0, result.stderr);
      const cargo = events.filter(({ kind }) => kind === 'cargo');
      assert.equal(cargo.filter(({ args }) => args[0] === 'test').length, 12);
      const clean = cargo.filter(({ args }) => args[0] === 'clean');
      assert.equal(clean.length, 1);
      assert.deepEqual(clean[0].args.slice(-2), ['--package', 'groot']);
      assert.ok(cargo.every(({ args }) => args.includes('--locked') || args[0] === 'clean'));
      const optimized = cargo.filter(({ args }) => args.includes('--config'));
      assert.equal(optimized.length, 2);
      for (const { args } of optimized) {
        assert.ok(args.includes('profile.test.package.miniscript.opt-level=3'));
        assert.ok(args.includes('profile.test.package.groot.opt-level=3'));
      }
      assert.equal(
        cargo.some(({ args }) => args[0] === 'llvm-cov'),
        false
      );
    });
  }
);
