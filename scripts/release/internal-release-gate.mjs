#!/usr/bin/env node
import { run } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, resolve } from 'node:path';
import { isSourceApprovalRequired } from './verify-mainnet-source-policy.mjs';

export const releaseTestFiles = [
  'build-source-watch.test.mjs',
  'assert-public-release-authorized.test.mjs',
  'verify-mainnet-source-policy.test.mjs',
  'sbom-order.test.mjs',
  'production-macos-release.test.mjs'
];
const pinTest = 'pins every reviewed mainnet-critical source byte';
const macTest =
  'macOS inspection rejects the released signing shape and accepts camera-only signing';

// Review this inventory whenever a mandatory release test is added or removed.
const releaseTestCounts = new Map(
  releaseTestFiles.map((file, index) => [file, [1, 6, 11, 1, 11][index]])
);

export function classifyReleaseTests(events, platform = process.platform) {
  const outcomes = events.filter(({ type }) => type === 'test:pass' || type === 'test:fail');
  const summaries = events.filter(({ type }) => type === 'test:summary');
  const total = summaries.filter(({ data }) => !data.file);
  if (total.length !== 1 || summaries.length !== releaseTestFiles.length + 1) {
    throw new Error('Missing unique release-test summaries');
  }
  const seen = new Set();
  for (const { type, data } of outcomes) {
    const file = basename(data.file ?? '');
    const identity = `${file}\0${data.name}`;
    if (
      !releaseTestCounts.has(file) ||
      data.nesting !== 0 ||
      data.details?.type !== 'test' ||
      !Number.isInteger(data.line) ||
      data.line < 1 ||
      typeof data.name !== 'string' ||
      !data.name ||
      seen.has(identity)
    ) {
      throw new Error('Unexpected, duplicate or missing real release-test outcome');
    }
    seen.add(identity);
    if (
      data.todo ||
      (data.skip &&
        !(
          type === 'test:pass' &&
          platform !== 'darwin' &&
          data.name === macTest &&
          file === 'production-macos-release.test.mjs'
        ))
    ) {
      throw new Error('Unexpected skipped release test');
    }
  }
  const countOutcomes = (items) => ({
    tests: items.length,
    failed: items.filter(({ type }) => type === 'test:fail').length,
    passed: items.filter(({ type, data }) => type === 'test:pass' && !data.skip).length,
    cancelled: 0,
    skipped: items.filter(({ data }) => data.skip).length,
    todo: 0
  });
  const assertCounts = (actual, expected) => {
    for (const [key, value] of Object.entries(expected)) {
      if (actual?.[key] !== value) throw new Error(`Release-test summary has inconsistent ${key}`);
    }
  };
  for (const [file, count] of releaseTestCounts) {
    const summary = summaries.filter(({ data }) => data.file && basename(data.file) === file);
    const items = outcomes.filter(({ data }) => basename(data.file) === file);
    if (summary.length !== 1 || items.length !== count) {
      throw new Error(`Missing or unexpected release tests: ${file}`);
    }
    assertCounts(summary[0].data.counts, countOutcomes(items));
  }
  const counts = countOutcomes(outcomes);
  assertCounts(total[0].data.counts, counts);
  if (
    counts.tests !== 30 ||
    counts.failed !== 1 ||
    counts.skipped !== (platform === 'darwin' ? 0 : 1)
  ) {
    throw new Error(
      'Release tests have an unexpected failure, cancellation, skip or missing outcome'
    );
  }
  const failure = outcomes.find(({ type }) => type === 'test:fail').data;
  const error = failure.details.error;
  if (
    basename(failure.file) !== 'verify-mainnet-source-policy.test.mjs' ||
    failure.name !== pinTest ||
    error?.failureType !== 'testCodeFailure' ||
    error.cause?.code !== 'ERR_ASSERTION' ||
    error.cause.operator !== 'doesNotThrow' ||
    !isSourceApprovalRequired(error.cause.actual)
  ) {
    throw new Error('Release failure is not the exact frozen source-approval stop');
  }
  return {
    tests: counts.tests,
    passed: counts.passed,
    sourceApproval: 'pending',
    skipped: counts.skipped
  };
}

export async function collectReleaseTests(files, log = console.log) {
  const events = [];
  for await (const event of run({ files, concurrency: 1, timeout: 120_000 })) {
    if (['test:pass', 'test:fail', 'test:summary'].includes(event.type)) events.push(event);
    if (event.type === 'test:fail')
      log(`FAIL ${event.data.name}: ${event.data.details.error?.message}`);
    if (event.type === 'test:stdout' || event.type === 'test:stderr') log(event.data.message);
  }
  return events;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Internal release gate takes no arguments');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const events = await collectReleaseTests(
      releaseTestFiles.map((name) => resolve(root, 'scripts/release', name))
    );
    console.log(JSON.stringify(classifyReleaseTests(events)));
    const result = spawnSync('bash', ['scripts/release/check-mainnet-gate.sh', '--internal'], {
      cwd: root,
      stdio: 'inherit'
    });
    if (result.status !== 0 || result.error || result.signal)
      throw new Error('Internal structural release checks failed');
    console.log('Internal release checks passed; public source approval remains pending.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
