import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseDocument } from 'yaml';

const root = new URL('../../', import.meta.url);
function workflow(path) {
  const document = parseDocument(readFileSync(new URL(path, root), 'utf8'), {
    uniqueKeys: true,
    maxAliasCount: 0
  });
  assert.deepEqual(document.errors, [], `${path} must be valid YAML`);
  return document.toJS({ maxAliasCount: 0 });
}
const ci = workflow('.github/workflows/ci.yml');
const internal = workflow('.github/workflows/experimental-desktop.yml');
const crossPlatformBuilder = readFileSync(
  new URL('scripts/release/build-cross-platform-testnet4.mjs', root),
  'utf8'
);
const runs = (job) => job.steps.flatMap((step) => (step.run ? [step.run] : []));
const aggregate = ci.jobs.frontend;
const aggregateStep = aggregate.steps.find((step) => step.env?.CI_REQUIRED_RESULTS);
const aggregateCode = aggregateStep.run.match(/<<'NODE'\n([\s\S]*?)\nNODE\s*$/)?.[1];
assert.ok(aggregateCode, 'the required gate must have an executable result validator');
const lanes = ['frontend-checks', 'browser', 'rust'];
const successful = () => Object.fromEntries(lanes.map((lane) => [lane, { result: 'success' }]));
function checkResults(results) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', aggregateCode], {
    encoding: 'utf8',
    env: { ...process.env, CI_REQUIRED_RESULTS: JSON.stringify(results) }
  });
}

test('required acceptance gate succeeds only with the complete successful inventory', () => {
  assert.equal(aggregate.if, 'always()');
  assert.deepEqual(aggregate.needs, lanes);
  assert.equal(aggregateStep.env.CI_REQUIRED_RESULTS, '${{ toJSON(needs) }}');
  const result = checkResults(successful());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Every required acceptance lane succeeded/);
});

test('required acceptance gate propagates failure, cancellation and skipped lanes', () => {
  for (const lane of lanes) {
    for (const status of ['failure', 'cancelled', 'skipped', 'pending', undefined]) {
      const results = successful();
      results[lane] = status === undefined ? {} : { result: status };
      const result = checkResults(results);
      assert.notEqual(result.status, 0, `${lane}: ${String(status)}`);
      assert.match(result.stderr, /did not succeed/);
    }
  }
});

test('required acceptance gate rejects missing, unexpected and malformed results', () => {
  for (const lane of lanes) {
    const results = successful();
    delete results[lane];
    assert.notEqual(checkResults(results).status, 0, `missing ${lane}`);
  }
  assert.notEqual(checkResults({ ...successful(), unreviewed: { result: 'success' } }).status, 0);
  for (const results of [null, [], {}, 'success']) {
    assert.notEqual(checkResults(results).status, 0);
  }
});

test('browser projects keep their complete case inventory and independent failure evidence', () => {
  const browser = ci.jobs.browser;
  assert.equal(browser.strategy['fail-fast'], false);
  assert.deepEqual(browser.strategy.matrix.include, [
    { project: 'desktop', browser: 'chromium' },
    { project: 'mobile', browser: 'webkit' }
  ]);
  const commands = runs(browser);
  assert.ok(commands.includes('pnpm exec playwright install --with-deps ${{ matrix.browser }}'));
  const acceptance = commands.find((command) => command.includes('pnpm test:acceptance'));
  assert.ok(acceptance);
  assert.match(acceptance, /--global-timeout=1500000(?:[;\s]|$)/);
  assert.match(acceptance, /--project=\$\{\{ matrix\.project \}\} --workers=1(?:[;\s]|$)/);
  assert.doesNotMatch(acceptance, /--(?:grep|shard|pass-with-no-tests|retries)(?:[=\s]|$)/);
  const evidence = browser.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(evidence.if, 'always()');
  assert.match(evidence.with.name, /matrix\.project/);
  assert.match(evidence.with.path, /test-results\//);
});

test('CI uses one full frontend coverage pass and keeps native obligations', () => {
  const commands = runs(ci.jobs['frontend-checks']);
  assert.equal(commands.filter((command) => /pnpm validate:ci\b/.test(command)).length, 1);
  assert.equal(
    commands.filter((command) => /pnpm test(?::coverage)?(?:\s|$)/.test(command)).length,
    0
  );
  assert.ok(commands.includes('pnpm test:sbom'));
  assert.ok(commands.includes('pnpm audit --prod --audit-level high'));
  const native = runs(ci.jobs.rust).join('\n');
  assert.match(native, /cargo fmt --check/);
  assert.match(native, /cargo clippy --locked --all-targets --all-features -- -D warnings/);
  assert.match(native, /cargo test --locked --all-targets --all-features/);
  assert.match(native, /cargo test --locked --doc --all-features/);
  assert.match(native, /cargo doc --locked --no-deps --all-features/);
  assert.match(native, /cargo audit --file Cargo\.lock/);
  const cleanCommands = native.split('\n').filter((command) => command.includes('cargo clean'));
  assert.deepEqual(cleanCommands, [
    'cargo clean --locked --package groot --target-dir "$CARGO_TARGET_DIR"'
  ]);
  assert.ok(
    native.indexOf('cargo test --locked --doc --all-features') < native.indexOf(cleanCommands[0])
  );

  assert.match(native, /scripts\/network\/check-native-builds\.sh/);
  assert.equal((native.match(/scripts\/quality\/check-rust-full-coverage\.sh/g) ?? []).length, 1);
  assert.doesNotMatch(
    native,
    /scripts\/regtest\/test\.sh|scripts\/quality\/check-rust-coverage\.sh/
  );
});

test('ordinary and instrumented caches cannot include workspace or packaged app binaries', () => {
  const native = ci.jobs.rust;
  assert.notEqual(native.env.CARGO_TARGET_DIR, native.env.CARGO_LLVM_COV_TARGET_DIR);
  const caches = native.steps.filter((step) => step.uses?.startsWith('Swatinem/rust-cache@'));
  assert.equal(caches.length, 2);
  assert.notEqual(caches[0].with.key, caches[1].with.key);
  assert.deepEqual(caches.map((step) => step.with.workspaces).sort(), [
    'src-tauri -> target/coverage',
    'src-tauri -> target/normal'
  ]);
  for (const cache of [
    ...caches,
    ...internal.jobs.package.steps.filter((step) => step.uses?.startsWith('Swatinem/rust-cache@'))
  ]) {
    assert.equal(cache.with['cache-workspace-crates'], false);
    assert.equal(cache.with['cache-all-crates'] ?? false, false);
    assert.equal(cache.with['cache-directories'], undefined);
    assert.equal(cache.with['cache-on-failure'] ?? false, false);
    assert.equal(typeof cache.with['save-if'], 'string');
  }
});

test('internal packages use structured release-stop validation and preserve Windows coverage', () => {
  const steps = internal.jobs.package.steps;
  const linux = steps.find(
    (step) => step.if === "runner.os == 'Linux'" && step.run?.includes('validate:internal')
  );
  assert.ok(linux, 'Linux must run complete internal validation');
  assert.doesNotMatch(linux.run, /grep|set \+e|PIPESTATUS/);
  const windows = steps.find((step) => step.name === 'Run Windows-compatible validation');
  const windowsCommands = windows.run.split('\n').map((command) => command.trim());
  const internalGate = 'pnpm test:release-gate:internal';
  assert.equal(
    windowsCommands.filter((command) => command === internalGate).length,
    1,
    'Windows must run exactly one explicit internal release gate'
  );
  assert.equal(
    runs(internal.jobs.package)
      .join('\n')
      .split('\n')
      .filter((command) => command.trim() === internalGate).length,
    1,
    'the explicit Windows gate must not be duplicated elsewhere in the workflow'
  );
  assert.ok(windowsCommands.indexOf(internalGate) < windowsCommands.indexOf('pnpm build'));
  assert.ok(windowsCommands.indexOf(internalGate) < windowsCommands.indexOf('pnpm build:testnet4'));
  const portableRuntimeTest = 'node --test scripts/release/prepare-hwi-runtime.test.mjs';
  assert.equal(
    windowsCommands.filter((command) => command === portableRuntimeTest).length,
    1,
    'Windows must exercise native-separator runtime inventory and depth limits'
  );
  assert.ok(windowsCommands.indexOf(portableRuntimeTest) < windowsCommands.indexOf('pnpm build'));
  assert.match(windows.run, /pnpm test:coverage/);
  assert.doesNotMatch(windows.run, /pnpm test\s*(?:\n|$)/);
  assert.match(
    runs(internal.jobs.package).join('\n'),
    /cargo test --locked --all-targets --all-features/
  );
  assert.equal(steps.filter((step) => step.uses?.startsWith('Swatinem/rust-cache@')).length, 1);
});

test('the shared cross-platform builder gates a clean checkout before staging and building', () => {
  const cleanCheckout = crossPlatformBuilder.indexOf(
    "execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all']"
  );
  const cleanCheckoutRejection = crossPlatformBuilder.indexOf(
    'Cross-platform package builds require a clean tracked and untracked source checkout'
  );
  const internalGate = crossPlatformBuilder.indexOf(
    "execFileSync(process.execPath, [join(repoRoot, 'scripts/release/internal-release-gate.mjs')]"
  );
  const firstStageMutation = crossPlatformBuilder.indexOf('rmSync(stage');
  const packageBuild = crossPlatformBuilder.indexOf("['exec', 'tauri', 'build'");
  const firstSourceRecheck = crossPlatformBuilder.indexOf('assertSourceUnchanged();', packageBuild);
  const outputCreation = crossPlatformBuilder.indexOf('mkdirSync(outputRoot');
  const evidenceChecksums = crossPlatformBuilder.indexOf("join(outputRoot, 'SHA256SUMS')");
  const finalSourceRecheck = crossPlatformBuilder.lastIndexOf('assertSourceUnchanged();');
  assert.ok(cleanCheckout >= 0, 'the builder must validate the clean checkout');
  assert.ok(
    cleanCheckoutRejection > cleanCheckout,
    'the clean-checkout validation must reject a dirty source tree'
  );
  assert.ok(
    internalGate > cleanCheckoutRejection,
    'the internal gate must follow clean-checkout validation'
  );
  assert.ok(
    firstStageMutation > internalGate,
    'the internal gate must run before the first staging mutation'
  );
  assert.ok(packageBuild > firstStageMutation, 'the package build must follow staging');
  assert.ok(
    firstSourceRecheck > packageBuild && outputCreation > firstSourceRecheck,
    'source must be rechecked after compilation and before artifact output'
  );
  assert.ok(
    finalSourceRecheck > evidenceChecksums,
    'source must remain unchanged through final evidence generation'
  );
  assert.equal(
    (crossPlatformBuilder.match(/assertSourceUnchanged\(\);/g) ?? []).length,
    2,
    'the shared builder must recheck source after build and evidence generation'
  );
  assert.equal(
    (crossPlatformBuilder.match(/scripts\/release\/internal-release-gate\.mjs/g) ?? []).length,
    1
  );

  const packageSteps = internal.jobs.package.steps.filter(
    (step) => step.run?.trim() === 'node scripts/release/build-cross-platform-testnet4.mjs'
  );
  assert.equal(packageSteps.length, 1, 'both matrix hosts must use the protected shared builder');
  assert.equal(packageSteps[0].if, undefined);
  assert.deepEqual(
    internal.jobs.package.strategy.matrix.include.map(({ platform }) => platform),
    ['linux-x86_64', 'windows-x86_64']
  );
});

test('every acceptance job is bounded and keeps read-only permissions', () => {
  for (const document of [ci, internal]) {
    assert.deepEqual(document.permissions, { contents: 'read' });
    assert.equal(document.concurrency['cancel-in-progress'], true);
    for (const job of Object.values(document.jobs)) {
      assert.ok(job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 90);
      assert.notEqual(job['continue-on-error'], true);
    }
  }
});

test('timed evidence pipelines retain output and propagate a failing command', () => {
  const timedSteps = [...Object.values(ci.jobs), ...Object.values(internal.jobs)]
    .flatMap((job) => job.steps)
    .filter((step) => step.run?.includes('| tee '));
  assert.equal(timedSteps.length, 5);
  for (const step of timedSteps) {
    assert.match(step.run, /set -o pipefail/);
    const pipeline = step.run.split('\n').find((line) => line.includes('| tee '));
    assert.match(pipeline, /\{ time [^;]+; \} 2>&1 \| tee /);
    for (const status of [0, 17]) {
      const directory = mkdtempSync(join(tmpdir(), 'groot-ci-pipeline-'));
      try {
        const fixture = pipeline
          .replace(
            /\{ time [^;]+; \}/,
            `{ time sh -c 'printf \"injected operation\\n\"; exit ${status}'; }`
          )
          .replaceAll('${{ matrix.project }}', 'desktop');
        const result = spawnSync(
          process.platform === 'win32' ? 'bash' : '/bin/bash',
          ['-e', '-c', `set -o pipefail\n${fixture}`],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              LC_ALL: 'C',
              TIMEFORMAT: 'real %R',
              RUNNER_TEMP: directory.replaceAll('\\', '/')
            }
          }
        );
        assert.equal(result.status, status, result.stderr);
        const logs = readdirSync(directory);
        assert.equal(logs.length, 1);
        const log = readFileSync(join(directory, logs[0]), 'utf8');
        assert.match(log, /injected operation/);
        if (status === 0) assert.match(log, /real\s+\d/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
});
