import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyReleaseTests, releaseTestFiles } from './internal-release-gate.mjs';
import { verifyInternalSourcePolicy } from './verify-internal-source-policy.mjs';
import {
  isSourceApprovalRequired,
  validatePinnedPolicySources
} from './verify-mainnet-source-policy.mjs';
const sourcePath = 'package.json';
const code = 'ERR_SOURCE_APPROVAL_REQUIRED';
const message = `${sourcePath} changed after the mainnet-candidate policy snapshot was reviewed`;
const pinTest = 'pins every reviewed mainnet-critical source byte';
const macTest =
  'macOS inspection rejects the released signing shape and accepts camera-only signing';
const fileCounts = [1, 4, 11, 1, 11];
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const bytes = (p) => readFileSync(new URL(p, root));

function summarize(outcomes) {
  return {
    tests: outcomes.length,
    passed: outcomes.filter(({ type, data }) => type === 'test:pass' && !data.skip).length,
    failed: outcomes.filter(({ type }) => type === 'test:fail').length,
    cancelled: 0,
    skipped: outcomes.filter(({ data }) => data.skip).length,
    todo: 0
  };
}
function fixture(platform = 'darwin') {
  const events = releaseTestFiles.flatMap((file, index) =>
    Array.from({ length: fileCounts[index] }, (_, number) => {
      const pin = index === 2 && number === 0;
      const mac = index === 4 && number === fileCounts[index] - 1;
      return {
        type: pin ? 'test:fail' : 'test:pass',
        data: {
          file,
          name: pin ? pinTest : mac ? macTest : `fixture ${index}:${number}`,
          nesting: 0,
          line: number + 1,
          skip: mac && platform !== 'darwin' ? true : undefined,
          details: {
            type: 'test',
            error: pin
              ? {
                  failureType: 'testCodeFailure',
                  cause: {
                    code: 'ERR_ASSERTION',
                    operator: 'doesNotThrow',
                    actual: { message, cause: { code, sourcePath } }
                  }
                }
              : undefined
          }
        }
      };
    })
  );
  const outcomes = [...events];
  for (const file of releaseTestFiles) {
    events.push({
      type: 'test:summary',
      data: {
        file,
        counts: summarize(outcomes.filter(({ data }) => data.file === file))
      }
    });
  }
  events.push({ type: 'test:summary', data: { counts: summarize(outcomes) } });
  return events;
}
const pin = (events) => events.find(({ type }) => type === 'test:fail');

test('internal release files match the canonical mandatory release command', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  const command = scripts['test:release-gate'].split(' && ')[0];
  assert.ok(command.startsWith('node --test '));
  const files = command.slice('node --test '.length).split(' ');
  assert.ok(files.every((file) => /^scripts\/release\/[\w-]+\.test\.mjs$/.test(file)));
  assert.deepEqual(
    files.map((file) => new URL(file, root).pathname),
    releaseTestFiles.map((file) => new URL(file, import.meta.url).pathname)
  );
});

test('permits only the typed frozen pin assertion with all 28 real-test outcomes', () => {
  assert.deepEqual(classifyReleaseTests(fixture(), 'darwin'), {
    tests: 28,
    passed: 27,
    sourceApproval: 'pending',
    skipped: 0
  });
});
test('source-approval identity requires canonical cause metadata and its exact pin message', () => {
  const expected = { message, cause: { code, sourcePath } };
  assert.equal(isSourceApprovalRequired(expected), true);
  const unknownPath = 'unreviewed.rs';
  for (const error of [
    undefined,
    null,
    message,
    new Error(message),
    { code, sourcePath, message },
    { ...expected, cause: { code: 'ERR_OTHER', sourcePath } },
    { ...expected, cause: { sourcePath } },
    {
      message: `${unknownPath} changed after the mainnet-candidate policy snapshot was reviewed`,
      cause: { code, sourcePath: unknownPath }
    },
    { ...expected, cause: { code, sourcePath: '../package.json' } },
    { ...expected, cause: { code } },
    { ...expected, message: 'unrelated failure' }
  ])
    assert.equal(isSourceApprovalRequired(error), false);
  const events = fixture();
  const earlierPath = 'src-tauri/src/wallet/activity.rs';
  pin(events).data.details.error.cause.actual = {
    message: `${earlierPath} changed after the mainnet-candidate policy snapshot was reviewed`,
    cause: { code, sourcePath: earlierPath }
  };
  assert.equal(classifyReleaseTests(events, 'darwin').sourceApproval, 'pending');
});
test('rejects missing individual tests even with self-consistent reduced summaries', () => {
  const e = fixture();
  const removed = e.splice(1, 1)[0];
  for (const { type, data } of e) {
    if (type === 'test:summary' && (!data.file || data.file === removed.data.file)) {
      data.counts.tests--;
      data.counts.passed--;
    }
  }
  assert.throws(() => classifyReleaseTests(e, 'darwin'), /Missing or unexpected release tests/);
});
test('rejects duplicate outcomes without trusting their complete summary totals', () => {
  const e = fixture();
  e[1].data.name = e[2].data.name;
  assert.throws(() => classifyReleaseTests(e, 'darwin'), /duplicate/);
});
test('rejects combined failures even when summaries lie about the failure count', () => {
  const e = fixture();
  e[0].type = 'test:fail';
  e[0].data.details.error = { failureType: 'testCodeFailure' };
  assert.throws(() => classifyReleaseTests(e, 'darwin'), /inconsistent/);
});
test('rejects cancellations, todos, missing summaries, containers and wrong assertion causes', () => {
  const mutate = [
    (e) => {
      e.at(-1).data.counts.cancelled = 1;
    },
    (e) => {
      e.at(-1).data.counts.todo = 1;
    },
    (e) => {
      e.at(-1).data.counts.passed = 0;
    },
    (e) => {
      e.at(-1).data.counts.skipped = 1;
    },
    (e) => e.pop(),
    (e) => e.splice(-2, 1),
    (e) => e.splice(0, 1),
    (e) => {
      pin(e).data.details.error.cause.actual.message = 'different';
    },
    (e) => {
      pin(e).data.details.error.cause.actual.cause.code = 'ERR_OTHER';
    },
    (e) => {
      delete pin(e).data.details.error.cause.actual.cause.code;
    },
    (e) => {
      pin(e).data.details.error.cause.actual.cause.sourcePath = 'unreviewed.rs';
    },
    (e) => {
      pin(e).data.details.error.cause.operator = 'throws';
    },
    (e) => {
      pin(e).data.details.error.cause.code = 'ERR_OTHER';
    },
    (e) => {
      pin(e).data.details.error.failureType = 'cancelledByParent';
    },
    (e) => {
      pin(e).data.file = 'another.test.mjs';
    },
    (e) => {
      pin(e).data.name = 'unrelated';
    },
    (e) => {
      e[0].data.details.type = 'suite';
    },
    (e) => {
      e[0].data.nesting = 1;
    },
    (e) => {
      e[0].data.line = 0;
    },
    (e) => {
      e[0].data.todo = true;
    },
    (e) => {
      e[0].data.skip = true;
    },
    (e) => {
      e.at(-2).data.counts.passed--;
    }
  ];
  for (const change of mutate) {
    const e = fixture();
    change(e);
    assert.throws(() => classifyReleaseTests(e, 'darwin'));
  }
});
test('only the named macOS compiler fixture may skip on other systems', () => {
  const e = fixture('linux');
  assert.deepEqual(classifyReleaseTests(e, 'linux'), {
    tests: 28,
    passed: 26,
    sourceApproval: 'pending',
    skipped: 1
  });
  assert.throws(() => classifyReleaseTests(e, 'darwin'));
  const skipped = e.find(({ data }) => data.skip);
  skipped.data.name = 'other skip';
  assert.throws(() => classifyReleaseTests(e, 'linux'), /Unexpected skipped/);
  assert.throws(() => classifyReleaseTests(fixture(), 'linux'));
});
test('semantic regressions remain failures after any known pending source pin', () => {
  verifyInternalSourcePolicy(read, bytes);
  assert.throws(
    () =>
      verifyInternalSourcePolicy(
        (p) =>
          p === 'src/lib/config.ts'
            ? "export const SUPPORTED_NETWORKS = ['mainnet'] as const;"
            : read(p),
        bytes
      ),
    /unsafe/
  );
  const earlierRead = (p) => (p === 'src-tauri/src/wallet/activity.rs' ? 'unreviewed' : read(p));
  assert.throws(
    () => validatePinnedPolicySources(earlierRead, bytes),
    (error) =>
      isSourceApprovalRequired(error) &&
      error.cause.sourcePath === 'src-tauri/src/wallet/activity.rs'
  );
  assert.doesNotThrow(() => verifyInternalSourcePolicy(earlierRead, bytes));
  assert.throws(
    () =>
      verifyInternalSourcePolicy(
        (p) =>
          p === 'src/lib/config.ts'
            ? "export const SUPPORTED_NETWORKS = ['mainnet'] as const;"
            : earlierRead(p),
        bytes
      ),
    /unsafe/
  );
  assert.throws(() => verifyInternalSourcePolicy(read), /binary-safe source reader/);
});
test('actual Node events reject a second failure and a missing test beside the expected stop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'groot-internal-gate-'));
  try {
    const files = releaseTestFiles.map((name) => join(dir, name));
    const imports = "import test from 'node:test'; import assert from 'node:assert/strict';\n";
    const source = (index, count = fileCounts[index]) =>
      imports +
      Array.from({ length: count }, (_, number) =>
        index === 2 && number === 0
          ? `test(${JSON.stringify(pinTest)},()=>assert.doesNotThrow(()=>{throw new Error(${JSON.stringify(message)}, ${JSON.stringify({ cause: { code: 'ERR_SOURCE_APPROVAL_REQUIRED', sourcePath: 'package.json' } })})}));\n`
          : `test('real fixture ${index}:${number}',()=>{});\n`
      ).join('');
    for (let index = 0; index < files.length; index++) writeFileSync(files[index], source(index));
    const moduleUrl = new URL('./internal-release-gate.mjs', import.meta.url).href;
    const launcher = join(dir, 'run.mjs');
    writeFileSync(
      launcher,
      `import {collectReleaseTests,classifyReleaseTests} from ${JSON.stringify(moduleUrl)}; try{classifyReleaseTests(await collectReleaseTests(${JSON.stringify(files)},()=>{}),'darwin')}catch(e){console.error(e.message);process.exitCode=1}`
    );
    const isolatedEnvironment = { ...process.env };
    delete isolatedEnvironment.NODE_TEST_CONTEXT;
    const execute = () =>
      spawnSync(process.execPath, [launcher], {
        encoding: 'utf8',
        timeout: 15_000,
        env: isolatedEnvironment
      });
    const expected = execute();
    assert.equal(expected.status, 0, expected.stderr);
    writeFileSync(
      files[0],
      imports + "test('unrelated regression',()=>assert.fail('regression'));\n"
    );
    const combined = execute();
    assert.equal(combined.status, 1, combined.stderr);
    assert.match(combined.stderr, /unexpected failure/);
    writeFileSync(files[0], source(0));
    writeFileSync(files[2], source(2, fileCounts[2] - 1));
    const missing = execute();
    assert.equal(missing.status, 1, missing.stderr);
    assert.match(missing.stderr, /Missing or unexpected release tests/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
