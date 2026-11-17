import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import {
  REQUIRED_BROWSER_SHARDS,
  assertBrowserShardPlan,
  assertCompleteShardInventory,
  parsePlaywrightList
} from './browser-shard-inventory.mjs';
import {
  INTERNAL_ATTESTATION_POLICY,
  assertApprovedAttestationResults,
  buildGhVerifyArguments,
  extractProtectedEnvironmentExtensions,
  requireSafeGhVersion
} from '../release/verify-internal-artifact-attestation.mjs';

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
const lanes = ['frontend-checks', 'browser', 'rust', 'rust-audit', 'rust-coverage'];
const successful = () => Object.fromEntries(lanes.map((lane) => [lane, { result: 'success' }]));

function listBrowserTests(project, shard) {
  const args = ['exec', 'playwright', 'test', '--list', '--fully-parallel', `--project=${project}`];
  if (shard) args.push(`--shard=${shard.shard}/${shard.shards}`);
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const inventory = parsePlaywrightList(result.stdout, project);
  assert.ok(inventory.length > 0, `${project} browser inventory must not be empty`);
  return inventory;
}

function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  const bytes = [];
  for (let value = length; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function attestationCertificate(
  environment = INTERNAL_ATTESTATION_POLICY.deploymentEnvironment,
  subject = INTERNAL_ATTESTATION_POLICY.tokenSubject,
  additions = []
) {
  const extension = (lastOidByte, value) =>
    der(
      0x30,
      Buffer.concat([
        der(0x06, Buffer.from([0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, lastOidByte])),
        der(0x04, der(0x0c, Buffer.from(value, 'utf8')))
      ])
    );
  return der(
    0x30,
    der(0x30, Buffer.concat([extension(0x17, environment), extension(0x18, subject), ...additions]))
  );
}

function attestationResult(commit, rawCertificate = attestationCertificate(), overrides = {}) {
  return {
    attestation: {
      bundle: {
        verificationMaterial: { certificate: { rawBytes: rawCertificate.toString('base64') } }
      }
    },
    verificationResult: {
      signature: {
        certificate: {
          subjectAlternativeName: INTERNAL_ATTESTATION_POLICY.certificateIdentity,
          issuer: INTERNAL_ATTESTATION_POLICY.oidcIssuer,
          buildSignerDigest: commit,
          runnerEnvironment: 'github-hosted',
          sourceRepositoryURI: `https://github.com/${INTERNAL_ATTESTATION_POLICY.repository}`,
          sourceRepositoryDigest: commit,
          sourceRepositoryRef: INTERNAL_ATTESTATION_POLICY.sourceRef,
          sourceRepositoryIdentifier: INTERNAL_ATTESTATION_POLICY.repositoryId,
          sourceRepositoryOwnerIdentifier: INTERNAL_ATTESTATION_POLICY.repositoryOwnerId,
          buildConfigURI: INTERNAL_ATTESTATION_POLICY.certificateIdentity,
          buildConfigDigest: commit,
          ...overrides
        }
      }
    }
  };
}
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
  const matrix = browser.strategy.matrix.include;
  assert.equal(assertBrowserShardPlan(matrix), 6);
  assert.deepEqual(matrix, [
    { project: 'desktop', browser: 'chromium', shard: 1, shards: 2 },
    { project: 'desktop', browser: 'chromium', shard: 2, shards: 2 },
    { project: 'mobile', browser: 'webkit', shard: 1, shards: 4 },
    { project: 'mobile', browser: 'webkit', shard: 2, shards: 4 },
    { project: 'mobile', browser: 'webkit', shard: 3, shards: 4 },
    { project: 'mobile', browser: 'webkit', shard: 4, shards: 4 }
  ]);
  const commands = runs(browser);
  const sync = 'pnpm exec svelte-kit sync';
  assert.ok(commands.includes(sync));
  assert.ok(commands.includes('pnpm exec playwright install --with-deps ${{ matrix.browser }}'));
  const acceptance = commands.find((command) => command.includes('pnpm test:acceptance'));
  assert.ok(acceptance);
  assert.ok(commands.indexOf(sync) < commands.indexOf(acceptance));
  assert.match(acceptance, /--global-timeout=1500000(?:[;\s]|$)/);
  assert.match(acceptance, /--fully-parallel(?:[;\s]|$)/);
  assert.match(acceptance, /--project=\$\{\{ matrix\.project \}\}/);
  assert.match(acceptance, /--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.shards \}\}/);
  assert.match(acceptance, /--workers=1(?:[;\s]|$)/);
  assert.doesNotMatch(acceptance, /--(?:grep|pass-with-no-tests|retries)(?:[=\s]|$)/);
  const evidence = browser.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(evidence.if, 'always()');
  assert.equal(
    evidence.with.name,
    'browser-${{ matrix.project }}-shard-${{ matrix.shard }}-of-${{ matrix.shards }}-${{ github.sha }}'
  );
  assert.match(evidence.with.path, /matrix\.project/);
  assert.match(evidence.with.path, /matrix\.shard/);
  assert.match(evidence.with.path, /matrix\.shards/);
  assert.match(evidence.with.path, /test-results\//);
});

test('browser shard lists cover each project exactly once', () => {
  const matrix = ci.jobs.browser.strategy.matrix.include;
  for (const project of Object.keys(REQUIRED_BROWSER_SHARDS)) {
    const rows = matrix.filter((row) => row.project === project);
    const fullInventory = listBrowserTests(project);
    const shardInventories = rows.map((row) => ({
      label: `${project}:${row.shard}/${row.shards}`,
      tests: listBrowserTests(project, row)
    }));
    assert.equal(
      assertCompleteShardInventory(fullInventory, shardInventories),
      fullInventory.length
    );
  }
});

test('browser shard validation rejects missing, overlapping and unexpected inventories', () => {
  const validMatrix = [
    { project: 'desktop', browser: 'chromium', shard: 1, shards: 2 },
    { project: 'desktop', browser: 'chromium', shard: 2, shards: 2 },
    { project: 'mobile', browser: 'webkit', shard: 1, shards: 4 },
    { project: 'mobile', browser: 'webkit', shard: 2, shards: 4 },
    { project: 'mobile', browser: 'webkit', shard: 3, shards: 4 },
    { project: 'mobile', browser: 'webkit', shard: 4, shards: 4 }
  ];
  assert.throws(() => assertBrowserShardPlan(validMatrix.slice(1)), /missing/i);
  assert.throws(() => assertBrowserShardPlan([...validMatrix, validMatrix[0]]), /overlap/i);
  assert.throws(
    () =>
      assertBrowserShardPlan([
        ...validMatrix,
        { project: 'tablet', browser: 'webkit', shard: 1, shards: 1 }
      ]),
    /unexpected/i
  );

  const full = ['case-a', 'case-b', 'case-c'];
  assert.throws(
    () => assertCompleteShardInventory(full, [{ label: '1/2', tests: ['case-a'] }]),
    /missing/i
  );
  assert.throws(
    () =>
      assertCompleteShardInventory(full, [
        { label: '1/2', tests: ['case-a', 'case-b'] },
        { label: '2/2', tests: ['case-b', 'case-c'] }
      ]),
    /overlap/i
  );
  assert.throws(
    () =>
      assertCompleteShardInventory(full, [
        { label: '1/2', tests: ['case-a', 'case-b'] },
        { label: '2/2', tests: ['case-c', 'case-d'] }
      ]),
    /unexpected/i
  );
});

test('CI uses one full frontend coverage pass and keeps native obligations', () => {
  const frontend = ci.jobs['frontend-checks'];
  const commands = runs(frontend);
  const rustSetup = frontend.steps.find((step) => step.uses?.startsWith('dtolnay/rust-toolchain@'));
  assert.equal(rustSetup?.with.toolchain, '1.97.1');
  assert.ok(
    frontend.steps.indexOf(rustSetup) <
      frontend.steps.findIndex((step) => step.run?.includes('pnpm validate:ci'))
  );
  assert.equal(commands.filter((command) => /pnpm validate:ci\b/.test(command)).length, 1);
  assert.equal(
    commands.filter((command) => /pnpm test(?::coverage)?(?:\s|$)/.test(command)).length,
    0
  );
  assert.ok(commands.includes('pnpm test:sbom'));
  const sbom = frontend.steps.find((step) => step.run === 'pnpm test:sbom');
  assert.equal(
    sbom.if,
    "${{ !cancelled() && steps.dependencies.outcome == 'success' && steps.toolchain.outcome == 'success' }}"
  );
  assert.equal(
    frontend.steps.find((step) => step.id === 'dependencies')?.run,
    'pnpm install --frozen-lockfile'
  );
  assert.equal(rustSetup.id, 'toolchain');
  assert.ok(commands.includes('pnpm audit --prod --audit-level high'));
  const ordinaryRust = ci.jobs.rust;
  assert.deepEqual(ordinaryRust.strategy, {
    'fail-fast': false,
    matrix: { lane: ['test', 'checks'] }
  });
  for (const [command, lane] of [
    ['cargo fmt --check', 'checks'],
    ['cargo clippy --locked --all-targets --all-features -- -D warnings', 'checks'],
    ['cargo test --locked --all-targets --all-features', 'test'],
    ['cargo test --locked --doc --all-features', 'test'],
    ['cargo doc --locked --no-deps --all-features', 'checks'],
    ['scripts/network/check-native-builds.sh', 'checks']
  ]) {
    const steps = ordinaryRust.steps.filter((step) => step.run?.includes(command));
    assert.equal(steps.length, 1, command);
    assert.equal(steps[0].if, `matrix.lane == '${lane}'`, command);
  }
  const native = runs(ordinaryRust).join('\n');
  const audit = ci.jobs['rust-audit'];
  assert.deepEqual(runs(audit), [
    'cargo install cargo-audit --locked --version 0.22.2',
    'cargo audit --file Cargo.lock'
  ]);
  assert.equal(audit.defaults.run['working-directory'], 'src-tauri');
  assert.equal(audit.needs, undefined);
  assert.doesNotMatch(native, /cargo audit|cargo install cargo-audit/);
  assert.doesNotMatch(native, /cargo clean|scripts\/regtest\/test\.sh|check-rust-.*coverage\.sh/);
  const coverage = runs(ci.jobs['rust-coverage']).join('\n');
  assert.equal((coverage.match(/scripts\/quality\/check-rust-full-coverage\.sh/g) ?? []).length, 1);
  assert.match(coverage, /cargo install cargo-llvm-cov --locked --version 0\.8\.7/);
  assert.match(coverage, /sha256sum --check --strict/);
  assert.doesNotMatch(coverage, /cargo test|scripts\/regtest\/test\.sh|check-rust-coverage\.sh/);
  assert.equal(ci.jobs.rust.needs, undefined);
  assert.equal(ci.jobs['rust-coverage'].needs, undefined);
});

test('ordinary and instrumented caches cannot include workspace or packaged app binaries', () => {
  const native = ci.jobs.rust;
  const coverage = ci.jobs['rust-coverage'];
  assert.notEqual(native.env.CARGO_TARGET_DIR, coverage.env.CARGO_LLVM_COV_TARGET_DIR);
  assert.equal(native.env.CARGO_LLVM_COV_TARGET_DIR, undefined);
  assert.equal(coverage.env.CARGO_TARGET_DIR, undefined);
  const caches = [native, coverage].map((job) => {
    const [cache, ...duplicates] = job.steps.filter((step) =>
      step.uses?.startsWith('Swatinem/rust-cache@')
    );
    assert.ok(cache);
    assert.deepEqual(duplicates, []);
    return cache;
  });
  assert.equal(caches.length, 2);
  assert.notEqual(caches[0].with.key, caches[1].with.key);
  assert.equal(
    caches[0].with['save-if'],
    "${{ github.ref == 'refs/heads/main' && matrix.lane == 'test' }}"
  );
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
  assert.equal(internal.jobs.package.environment, 'internal-candidate-approval');
  assert.deepEqual(internal.jobs.package.env, {
    GROOT_INTERNAL_CANDIDATE_COMMIT: '${{ github.sha }}',
    GROOT_INTERNAL_APPROVAL_CONTEXT: 'protected-github-environment'
  });
  const steps = internal.jobs.package.steps;
  const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.deepEqual(checkout.with, {
    clean: true,
    'fetch-depth': 1,
    'persist-credentials': false,
    ref: '${{ github.sha }}'
  });
  const protectedApproval = steps.find(
    (step) => step.name === 'Bind protected approval to the exact detached candidate'
  );
  assert.match(protectedApproval.run, /GROOT_INTERNAL_CANDIDATE_COMMIT/);
  assert.match(protectedApproval.run, /git symbolic-ref -q HEAD/);
  assert.match(protectedApproval.run, /git status --porcelain=v1 --untracked-files=all/);
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
  const testnetConfig = JSON.parse(
    readFileSync(new URL('src-tauri/tauri.testnet4.conf.json', root), 'utf8')
  );
  assert.equal(testnetConfig.build.beforeBuildCommand, 'pnpm build:testnet4');
  assert.doesNotMatch(runs(internal.jobs.package).join('\n'), /pnpm build:testnet4/);
  const buildIndex = steps.findIndex(
    (step) => step.run?.trim() === 'node scripts/release/build-cross-platform-testnet4.mjs'
  );
  assert.ok(steps.indexOf(linux) < buildIndex && steps.indexOf(windows) < buildIndex);
  const attestationIndex = steps.findIndex(
    (step) => step.uses === 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6'
  );
  const packageUploadIndex = steps.findIndex(
    (step) =>
      step.uses?.startsWith('actions/upload-artifact@') && step.with?.name?.startsWith('groot-')
  );
  assert.ok(buildIndex < attestationIndex && attestationIndex < packageUploadIndex);
  for (const [os, script] of [
    ['Linux', 'smoke-linux-internal.sh'],
    ['Windows', 'smoke-windows-internal.ps1']
  ]) {
    const smokeIndex = steps.findIndex((step) => step.run?.includes(script));
    assert.ok(
      buildIndex < smokeIndex && smokeIndex < attestationIndex,
      `${os} must install and launch the candidate before attestation or upload`
    );
    assert.equal(steps[smokeIndex].if, `runner.os == '${os}'`);
    assert.match(steps[smokeIndex].run, /RUNNER_TEMP.*groot-\$\{\{ matrix\.platform \}\}/);
  }
  assert.equal(steps[attestationIndex].name, 'Attest protected candidate artifacts');
  assert.deepEqual(steps[attestationIndex].with, {
    'subject-path': '${{ runner.temp }}/groot-${{ matrix.platform }}/**/*'
  });
});

test('internal artifact verifier binds file, commit, workflow, hosted runner and Environment', () => {
  const commit = 'a'.repeat(40);
  assert.deepEqual(buildGhVerifyArguments('/tmp/groot.deb', commit), [
    'attestation',
    'verify',
    '/tmp/groot.deb',
    '--repo',
    'grootwallet/groot',
    '--cert-identity',
    INTERNAL_ATTESTATION_POLICY.certificateIdentity,
    '--cert-oidc-issuer',
    'https://token.actions.githubusercontent.com',
    '--source-digest',
    commit,
    '--source-ref',
    'refs/heads/codex/post-53-maintainability',
    '--signer-digest',
    commit,
    '--deny-self-hosted-runners',
    '--format',
    'json'
  ]);
  assert.equal(requireSafeGhVersion('gh version 2.102.0 (2026-10-01)\n'), '2.102.0');
  assert.throws(() => requireSafeGhVersion('gh version 2.101.0\n'), /2\.102\.0 or newer/);
  assert.throws(() => buildGhVerifyArguments('/tmp/groot.deb', 'a'.repeat(12)), /full/);

  // Use the format emitted by GitHub, independently of the verifier's policy.
  const emittedSubject =
    'repo:grootwallet@315751550/groot@1321708536:environment:internal-candidate-approval';
  const certificate = attestationCertificate('internal-candidate-approval', emittedSubject);
  const extensions = extractProtectedEnvironmentExtensions(certificate);
  assert.deepEqual(extensions, {
    deploymentEnvironment: 'internal-candidate-approval',
    tokenSubject: emittedSubject
  });
  assert.equal(
    assertApprovedAttestationResults(
      [attestationResult(commit, certificate), attestationResult(commit)],
      commit
    ),
    2
  );
});

test('internal artifact verifier rejects missing, duplicate and mismatched signed approval claims', () => {
  const commit = 'b'.repeat(40);
  const extension = (lastOidByte, value) =>
    der(
      0x30,
      Buffer.concat([
        der(0x06, Buffer.from([0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, lastOidByte])),
        der(0x04, der(0x0c, Buffer.from(value, 'utf8')))
      ])
    );
  const duplicateEnvironment = attestationCertificate(undefined, undefined, [
    extension(0x17, 'internal-candidate-approval')
  ]);
  const missingEnvironment = der(
    0x30,
    der(0x30, extension(0x18, INTERNAL_ATTESTATION_POLICY.tokenSubject))
  );
  const wrongSubjects = [
    'repo:grootwallet/groot:environment:internal-candidate-approval',
    'repo:grootwallet@315751550/groot@1321708537:environment:internal-candidate-approval',
    'repo:grootwallet@315751551/groot@1321708536:environment:internal-candidate-approval',
    'repo:grootwallet@315751550/groot@1321708536:ref:refs/heads/codex/post-53-maintainability'
  ];
  for (const result of [
    attestationResult(
      commit,
      attestationCertificate('unreviewed', INTERNAL_ATTESTATION_POLICY.tokenSubject)
    ),
    ...wrongSubjects.map((subject) =>
      attestationResult(
        commit,
        attestationCertificate(INTERNAL_ATTESTATION_POLICY.deploymentEnvironment, subject)
      )
    ),
    attestationResult(commit, missingEnvironment),
    attestationResult(commit, duplicateEnvironment),
    attestationResult(commit, attestationCertificate(), {
      subjectAlternativeName:
        'https://github.com/grootwallet/groot/.github/workflows/unreviewed.yml'
    }),
    attestationResult(commit, attestationCertificate(), { runnerEnvironment: 'self-hosted' }),
    attestationResult(commit, attestationCertificate(), { sourceRepositoryDigest: 'c'.repeat(40) })
  ]) {
    assert.throws(
      () => assertApprovedAttestationResults([result], commit),
      /No attestation proves protected candidate approval/
    );
  }
  const truncated = attestationCertificate().subarray(0, -1);
  assert.throws(() => extractProtectedEnvironmentExtensions(truncated), /exceeds|Truncated/);
});

test('the shared cross-platform builder binds the accepted commit before staging and building', () => {
  const sourceIdentity = crossPlatformBuilder.indexOf('requireInternalCandidateSource(repoRoot)');
  const cargoMetadata = crossPlatformBuilder.indexOf("'metadata'");
  const internalGate = crossPlatformBuilder.indexOf(
    "execFileSync(process.execPath, [join(repoRoot, 'scripts/release/internal-release-gate.mjs')]"
  );
  const firstStageMutation = crossPlatformBuilder.indexOf('rmSync(stage');
  const packageBuild = crossPlatformBuilder.indexOf(
    "process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'"
  );
  const firstSourceRecheck = crossPlatformBuilder.indexOf('assertSourceUnchanged();', packageBuild);
  const outputCreation = crossPlatformBuilder.indexOf('mkdirSync(outputRoot');
  const evidenceChecksums = crossPlatformBuilder.indexOf("join(outputRoot, 'SHA256SUMS')");
  const finalSourceRecheck = crossPlatformBuilder.lastIndexOf('assertSourceUnchanged();');
  assert.ok(sourceIdentity >= 0, 'the builder must bind the externally accepted source identity');
  assert.ok(cargoMetadata > sourceIdentity, 'source identity must precede Cargo metadata');
  assert.ok(internalGate > sourceIdentity, 'the internal gate must follow exact candidate binding');
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
  assert.match(crossPlatformBuilder, /assertInternalCandidateSource\(repoRoot, sourceIdentity\)/);
  assert.match(crossPlatformBuilder, /candidate_commit=\$\{sourceIdentity\.candidateCommit\}/);
  assert.match(crossPlatformBuilder, /source_tree=\$\{sourceIdentity\.sourceTree\}/);
  assert.match(crossPlatformBuilder, /'--',\s*'--locked'/);

  const packageSteps = internal.jobs.package.steps.filter(
    (step) => step.run?.trim() === 'node scripts/release/build-cross-platform-testnet4.mjs'
  );
  assert.equal(packageSteps.length, 1, 'both matrix hosts must use the protected shared builder');
  assert.equal(packageSteps[0].if, undefined);
  assert.deepEqual(
    internal.jobs.package.strategy.matrix.include.map(({ platform }) => platform),
    ['linux-x86_64', 'windows-x86_64']
  );
  const upload = internal.jobs.package.steps.find(
    (step) =>
      step.uses?.startsWith('actions/upload-artifact@') && step.with?.name?.startsWith('groot-')
  );
  assert.match(upload.with.name, /GROOT_INTERNAL_CANDIDATE_COMMIT/);
});

test('every acceptance job is bounded and keeps least-privilege permissions', () => {
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.deepEqual(internal.permissions, {
    contents: 'read',
    'id-token': 'write',
    attestations: 'write'
  });
  for (const document of [ci, internal]) {
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
          .replaceAll('${{ matrix.project }}', 'desktop')
          .replaceAll('${{ matrix.shard }}', '1')
          .replaceAll('${{ matrix.shards }}', '2');
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
