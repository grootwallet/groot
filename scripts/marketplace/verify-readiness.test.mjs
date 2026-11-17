import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  childEnvironment,
  inspectRuntime,
  listBrowserCases,
  parseOptions,
  ProcessHarness,
  redact,
  runVerification,
  verifyBrowserReport
} from './verify-readiness.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const fixture = 'scripts/marketplace/readiness-process.fixture.mjs';

/** @param {boolean} [finished] @param {string} [status] */
function browserReport(finished = true, status = 'passed') {
  return {
    errors: [],
    suites: [
      {
        specs: [
          {
            id: 'case-a',
            tests: [
              {
                expectedStatus: 'passed',
                projectName: 'desktop',
                status: finished ? 'expected' : 'skipped',
                results: finished ? [{ status, retry: 0 }] : []
              }
            ]
          }
        ]
      }
    ]
  };
}

/** @param {import('node:test').TestContext} context */
function temporary(context) {
  const path = mkdtempSync(join(tmpdir(), 'groot-marketplace-runner-'));
  context.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

/** @param {import('node:test').TestContext} context @param {{fail?:string,abort?:AbortController,drift?:boolean,cleanupDrift?:boolean,missing?:boolean,skip?:boolean,versionMissing?:boolean,serverExit?:boolean,serverCode?:number|null,serverSignal?:NodeJS.Signals|null}} [behavior] */
function injected(context, behavior = {}) {
  const root = temporary(context);
  /** @type {import('./verify-readiness.mjs').Command[]} */
  const calls = [];
  const stopped = new Set();
  let changed = false;
  let closed = false;
  /** @type {import('./verify-readiness.mjs').Harness} */
  const harness = {
    start(command) {
      calls.push(command);
      writeFileSync(command.log, `${command.id}\n`);
      const listing = command.args.includes('--list');
      if (command.env.GROOT_READINESS_JSON && !(behavior.missing && !listing)) {
        writeFileSync(
          command.env.GROOT_READINESS_JSON,
          JSON.stringify(browserReport(!listing, behavior.skip && !listing ? 'skipped' : 'passed'))
        );
      }
      if (command.env.GROOT_READINESS_VERSION && !behavior.versionMissing) {
        writeFileSync(
          command.env.GROOT_READINESS_VERSION,
          JSON.stringify({ name: command.env.GROOT_READINESS_BROWSER, version: '123.fixture' })
        );
      }
      if (behavior.drift && command.id === 'types') changed = true;
      if (behavior.abort && command.id === 'pass-1-chromium-rehearsal') behavior.abort.abort();
      return {
        result: Promise.resolve({
          code:
            command.server && behavior.serverCode !== undefined
              ? behavior.serverCode
              : behavior.fail === command.id
                ? 1
                : 0,
          signal: command.server ? (behavior.serverSignal ?? null) : null
        }),
        ready: Promise.resolve(),
        isRunning: () => !behavior.serverExit && !stopped.has(command.id),
        stop: async () => {
          stopped.add(command.id);
        }
      };
    },
    close: async () => {
      closed = true;
      if (behavior.cleanupDrift) changed = true;
    }
  };
  return {
    root,
    calls,
    stopped,
    isClosed: () => closed,
    configuration: {
      root,
      harness,
      signal: behavior.abort?.signal,
      inspect: async () => ({
        node: process.versions.node,
        pnpm: 'pnpm@fixture',
        lockSha256: 'fixture',
        engines: {}
      }),
      snapshot: () => ({ sha256: changed ? 'changed-source' : 'frozen-source', files: [] }),
      freePort: async () => {},
      identify: async () => {}
    }
  };
}

test('CLI bounds passes, port and duplicate/unsupported options without a bypass switch', () => {
  assert.deepEqual(parseOptions([]), { passes: 2, port: 5199 });
  assert.deepEqual(parseOptions(['--passes=5', '--port=65535']), { passes: 5, port: 65535 });
  for (const args of [
    ['--passes=0'],
    ['--passes=6'],
    ['--passes=01'],
    ['--port=80'],
    ['--port=65536'],
    ['--passes=1', '--passes=2'],
    ['--skip-checks'],
    ['--retries=1'],
    ['--port=5199;echo']
  ]) {
    assert.throws(() => parseOptions(args));
  }
});

test('child environment excludes inherited secrets, Node hooks and discovery enablement', () => {
  const env = childEnvironment(
    {
      HOME: '/fixture/home',
      PATH: '/bin',
      NODE_OPTIONS: '--require=evil',
      API_TOKEN: 'synthetic',
      TAURI_ENV_PLATFORM: 'ios',
      GROOT_MARKETPLACE_DISCOVERY: '1'
    },
    '/fixture/node/bin/node'
  );
  assert.equal(env.PATH, '/fixture/node/bin:/bin');
  assert.equal(env.GROOT_MARKETPLACE_DISCOVERY, '0');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.API_TOKEN, undefined);
  assert.equal(env.TAURI_ENV_PLATFORM, undefined);
  assert.equal(env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, '1');
});

test('metadata/log redaction removes local roots and labelled credentials', () => {
  assert.equal(
    redact(
      'root=/workspace/demo token=fixture password: fixture /workspace/demo/file',
      '/workspace/demo'
    ),
    'root=<workspace> token=<redacted> password: <redacted> <workspace>/file'
  );
});

test('collection determines exact case identities; acceptance rejects skips, retries, omissions and unexpected cases', (context) => {
  const root = temporary(context);
  const path = join(root, 'report.json');
  writeFileSync(path, JSON.stringify(browserReport(false)));
  const identities = listBrowserCases(path);
  assert.deepEqual(identities, ['case-a/desktop']);
  writeFileSync(path, JSON.stringify(browserReport()));
  assert.deepEqual(verifyBrowserReport(path, identities), {
    passed: 1,
    failed: 0,
    skipped: 0,
    retries: 0
  });
  assert.throws(() => verifyBrowserReport(path, []));
  for (const status of ['failed', 'skipped', 'interrupted', 'timedOut']) {
    writeFileSync(path, JSON.stringify(browserReport(true, status)));
    assert.throws(() => verifyBrowserReport(path, identities));
  }
  const retried = browserReport();
  retried.suites[0].specs[0].tests[0].results[0].retry = 1;
  writeFileSync(path, JSON.stringify(retried));
  assert.throws(() => verifyBrowserReport(path, identities));
});

test('two default passes run sequential preflight, fresh owned servers and all engine/suite inventories without retries', async (context) => {
  const fixture = injected(context);
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.status, 'passed');
  const ids = fixture.calls.map((call) => call.id);
  assert.deepEqual(ids.slice(0, 7), [
    'format',
    'sync',
    'types',
    'runner-fixtures',
    'relay-fixtures',
    'units',
    'build'
  ]);
  const acceptance = fixture.calls.filter((call) => call.id.startsWith('pass-') && !call.server);
  assert.equal(acceptance.length, 16);
  assert.equal(fixture.calls.filter((call) => call.server).length, 8);
  assert.ok(ids.indexOf('build') < ids.indexOf('pass-1-chromium-server-0'));
  assert.equal(ids.filter((id) => id === 'sync').length, 1);
  assert.equal(ids.filter((id) => id.startsWith('inventory-')).length, 8);
  assert.ok(
    acceptance.every(
      (call) => call.args.includes('--retries=0') && call.args.includes('--workers=1')
    )
  );
  assert.ok(
    acceptance.every((call) => call.env.GROOT_READINESS_JSON?.startsWith(result.directory))
  );
  assert.ok(
    fixture.calls.filter((call) => call.server).every((call) => fixture.stopped.has(call.id))
  );
  assert.equal(fixture.isClosed(), true);
  assert.equal(
    existsSync(join(fixture.root, 'outputs/marketplace-readiness/.verification-lock')),
    false
  );
  assert.equal(
    JSON.parse(readFileSync(join(result.directory, 'source-manifest.json'), 'utf8')).sha256,
    'frozen-source'
  );
  assert.match(result.report.scope, /No live provider/);
  assert.equal(
    result.report.phases
      .filter((/** @type {{id:string}} */ phase) => phase.id.startsWith('pass-'))
      .every(
        (/** @type {{browser:{version:string}}} */ phase) => phase.browser.version === '123.fixture'
      ),
    true
  );
});

test('a failed phase stops immediately, preserves failed evidence and does not retry', async (context) => {
  const fixture = injected(context, { fail: 'pass-1-chromium-legacy' });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.status, 'failed');
  assert.equal(fixture.calls.filter((call) => call.id === 'pass-1-chromium-legacy').length, 1);
  assert.equal(
    fixture.calls.some((call) => call.id.startsWith('pass-2-')),
    false
  );
  assert.ok(existsSync(join(result.directory, 'pass-1-chromium-legacy.log')));
  assert.equal(fixture.stopped.has('pass-1-chromium-server-0'), true);
  assert.equal(fixture.isClosed(), true);
});

test('source drift prevents acceptance and cannot rewrite the frozen manifest', async (context) => {
  const fixture = injected(context, { drift: true });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 1);
  assert.match(result.report.error, /Source changed/);
  assert.equal(
    fixture.calls.some((call) => call.server),
    false
  );
  assert.equal(
    JSON.parse(readFileSync(join(result.directory, 'source-manifest.json'), 'utf8')).sha256,
    'frozen-source'
  );
});

test('source edits during final process cleanup cannot retain a passed result', async (context) => {
  const fixture = injected(context, { cleanupDrift: true });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.status, 'failed');
  assert.match(result.report.error, /Source changed during final/);
});

test('an owned server exiting after passing suites fails independent lifecycle attestation', async (context) => {
  const fixture = injected(context, { serverExit: true });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 1);
  assert.match(result.report.error, /server exited unexpectedly/);
  assert.equal(result.report.serverLifecycles[0].runningBeforeExpectedStop, false);
  assert.equal(result.report.serverLifecycles[0].status, 'failed');
  assert.equal(
    result.report.phases.filter((/** @type {{id:string}} */ phase) => phase.id.startsWith('pass-'))
      .length,
    3
  );
  assert.equal(
    fixture.calls.some((call) => call.id.startsWith('pass-2-')),
    false
  );
});

test('the owned requested SIGTERM may finish through Vite exit143 without hiding a failed suite', async (context) => {
  const fixture = injected(context, { serverCode: 143, fail: 'pass-1-chromium-rehearsal' });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 1);
  assert.match(result.report.error, /pass-1-chromium-rehearsal failed/);
  assert.equal(result.report.serverLifecycles[0].exitCode, 143);
  assert.equal(result.report.serverLifecycles[0].status, 'passed');
  assert.equal(result.report.secondaryErrors.length, 0);
});

test('an owned requested SIGTERM exit143 is accepted after otherwise passing acceptance', async (context) => {
  const fixture = injected(context, { serverCode: 143 });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 0);
  assert.equal(
    result.report.serverLifecycles.every(
      (/** @type {{status:string}} */ lifecycle) => lifecycle.status === 'passed'
    ),
    true
  );
});

test('secondary server failure never replaces the primary failed suite', async (context) => {
  const fixture = injected(context, { serverCode: 1, fail: 'pass-1-chromium-rehearsal' });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 1);
  assert.match(result.report.error, /pass-1-chromium-rehearsal failed/);
  assert.equal(result.report.serverLifecycles[0].status, 'failed');
  assert.match(result.report.secondaryErrors[0].error, /server exited unexpectedly/);
});

test('cancellation is nonzero, stops the owned server and records incomplete acceptance', async (context) => {
  const abort = new AbortController();
  const fixture = injected(context, { abort });
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 130);
  assert.equal(result.report.status, 'cancelled');
  assert.equal(fixture.stopped.has('pass-1-chromium-server-0'), true);
  assert.equal(result.report.phases.at(-1).status, 'cancelled');
});

for (const [name, behavior] of [
  ['missing browser JSON', { missing: true }],
  ['a skipped case', { skip: true }],
  ['missing engine version', { versionMissing: true }]
]) {
  test(`a zero exit cannot hide ${name}`, async (context) => {
    const fixture = injected(context, /** @type {any} */ (behavior));
    const result = await runVerification(fixture.configuration);
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.status, 'failed');
    assert.equal(fixture.isClosed(), true);
  });
}

test('an occupied port prevents child startup without reusing its listener', async (context) => {
  const fixture = injected(context);
  const first = await runVerification({
    ...fixture.configuration,
    freePort: async () => {
      throw new Error('Occupied port.');
    }
  });
  assert.equal(first.exitCode, 1);
  assert.equal(fixture.calls.length, 0);
  assert.match(first.report.error, /Occupied port/);
});

test('an occupied workspace lock and its ownership record are preserved', async (context) => {
  const fixture = injected(context);
  const path = join(fixture.root, 'outputs/marketplace-readiness/.verification-lock');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'owner'), 'another-run');
  const result = await runVerification(fixture.configuration);
  assert.equal(result.exitCode, 1);
  assert.equal(fixture.calls.length, 0);
  assert.equal(readFileSync(join(path, 'owner'), 'utf8'), 'another-run');
});

test('runtime pins and installed lock mismatch fail before any installation or child startup', async (context) => {
  const root = temporary(context);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: '0.0.0' } }));
  await assert.rejects(() => inspectRuntime(root), /exact Node version/);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ engines: { node: process.versions.node } })
  );
  writeFileSync(join(root, '.node-version'), process.versions.node);
  writeFileSync(join(root, '.nvmrc'), process.versions.node);
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'committed-fixture');
  mkdirSync(join(root, 'node_modules/.pnpm'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.pnpm/lock.yaml'), 'different-installed-fixture');
  await assert.rejects(() => inspectRuntime(root), /do not match the committed lockfile/);
});

test('real fixture subprocess logs are redacted and cannot survive timeout cleanup', async (context) => {
  const root = temporary(context);
  const harness = new ProcessHarness({ root: repository, stopGraceMs: 30 });
  context.after(() => harness.close());
  const command = {
    id: 'exit',
    args: [fixture, 'exit'],
    env: childEnvironment(process.env, process.execPath),
    log: join(root, 'exit.log')
  };
  const child = harness.start(command);
  assert.equal((await child.result).code, 0);
  await child.stop();
  const log = readFileSync(command.log, 'utf8');
  assert.match(log, /workspace=<workspace>/);
  assert.match(log, /password=<redacted>/);
  const hanging = harness.start({
    ...command,
    id: 'timeout',
    args: [fixture, 'hang'],
    log: join(root, 'timeout.log'),
    timeoutMs: 150
  });
  await hanging.ready;
  const result = await hanging.result;
  assert.equal(result.timedOut, true);
  assert.equal(result.signal, 'SIGKILL');
  await hanging.stop();
  assert.equal(harness.children.size, 0);
});

test('stopping an already closed child never signals its old process group', async (context) => {
  const root = temporary(context);
  let signals = 0;
  const harness = new ProcessHarness({
    root: repository,
    kill: () => {
      signals++;
      throw new Error('The completed process group must not be signalled.');
    }
  });
  context.after(() => harness.close());
  const child = harness.start({
    id: 'closed',
    args: [fixture, 'exit'],
    env: childEnvironment(process.env, process.execPath),
    log: join(root, 'closed.log')
  });
  assert.equal((await child.result).code, 0);
  assert.equal(child.isRunning(), false);
  await child.stop();
  await harness.close();
  assert.equal(signals, 0);
});

test('abort kills only the owned process tree, including a descendant', async (context) => {
  const root = temporary(context);
  const abort = new AbortController();
  const harness = new ProcessHarness({ root: repository, signal: abort.signal, stopGraceMs: 30 });
  context.after(() => harness.close());
  const identities = join(root, 'owned.json');
  const child = harness.start({
    id: 'tree',
    args: [fixture, 'tree', identities],
    env: childEnvironment(process.env, process.execPath),
    log: join(root, 'tree.log')
  });
  await child.ready;
  const pids = JSON.parse(readFileSync(identities, 'utf8'));
  abort.abort();
  await child.result;
  await child.stop();
  assert.throws(() => process.kill(pids.parent, 0), { code: 'ESRCH' });
  // A killed descendant can briefly be a zombie while the OS reaps it; it cannot execute.
  if (process.platform === 'linux' && existsSync(`/proc/${pids.descendant}/stat`)) {
    assert.equal(readFileSync(`/proc/${pids.descendant}/stat`, 'utf8').split(' ')[2], 'Z');
  } else {
    assert.throws(() => process.kill(pids.descendant, 0), { code: 'ESRCH' });
  }
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});

test('an attempted upstream fetch signal is explicit and triggers child cancellation', async (context) => {
  const root = temporary(context);
  const abort = new AbortController();
  let blocked = false;
  const harness = new ProcessHarness({
    root: repository,
    signal: abort.signal,
    stopGraceMs: 30,
    onBlocked: () => {
      blocked = true;
      abort.abort();
    }
  });
  context.after(() => harness.close());
  const child = harness.start({
    id: 'block',
    args: [fixture, 'block'],
    env: childEnvironment(process.env, process.execPath),
    log: join(root, 'block.log')
  });
  await child.result;
  await child.stop();
  assert.equal(blocked, true);
  assert.equal(abort.signal.aborted, true);
});
