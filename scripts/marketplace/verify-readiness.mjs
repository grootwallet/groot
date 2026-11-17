import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  chmodSync,
  writeFileSync
} from 'node:fs';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDefault = fileURLToPath(new URL('../../', import.meta.url));
export const SCOPE =
  'Local synthetic marketplace frontend verification only. No live provider, account, funds, native wallet, legal approval, independent security audit or production certification.';
const TIMEOUT_MS = 15 * 60_000;
const STOP_GRACE_MS = 2_000;
const BROWSERS = ['chromium', 'webkit'];
const SUITES = [
  { id: 'rehearsal', file: 'e2e/marketplace-rehearsal.spec.ts', flag: '0' },
  { id: 'legacy', file: 'e2e/marketplace.spec.ts', flag: '0' },
  {
    id: 'discovery-disabled',
    file: 'e2e/marketplace-discovery.spec.ts',
    flag: '0',
    grep: 'public discovery stays disabled'
  },
  {
    id: 'discovery-enabled',
    file: 'e2e/marketplace-discovery.spec.ts',
    flag: '1',
    grep: 'explicitly enabled read-only public discovery'
  }
];

/** @typedef {{passes:number,port:number}} Options */
/** @typedef {{code:number|null,signal:NodeJS.Signals|null,timedOut?:boolean}} Exit */
/** @typedef {{id:string,args:string[],env:NodeJS.ProcessEnv,log:string,timeoutMs?:number,server?:boolean}} Command */
/** @typedef {{result:Promise<Exit>,ready:Promise<void>,isRunning:()=>boolean,stop:()=>Promise<void>}} OwnedChild */
/** @typedef {{start:(command:Command)=>OwnedChild,close:()=>Promise<void>}} Harness */

/** @param {string[]} args @returns {Options} */
export function parseOptions(args) {
  const options = { passes: 2, port: 5199 };
  const seen = new Set();
  for (const argument of args) {
    const match = /^--(passes|port)=([1-9][0-9]*)$/.exec(argument);
    if (!match || seen.has(match[1])) throw new Error('Use --passes=1..5 and --port=1024..65535.');
    seen.add(match[1]);
    const value = Number(match[2]);
    if (!Number.isSafeInteger(value)) throw new Error('Option exceeds its supported range.');
    if (match[1] === 'passes') {
      if (value > 5) throw new Error('Passes must be between 1 and 5.');
      options.passes = value;
    } else {
      if (value < 1024 || value > 65535) throw new Error('Port must be between 1024 and 65535.');
      options.port = value;
    }
  }
  return options;
}

/** @param {unknown} value */
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid JSON record.');
  return /** @type {Record<string, any>} */ (value);
}

/** @param {string} path */
function readJson(path) {
  return record(JSON.parse(readFileSync(path, 'utf8')));
}

/** @param {Buffer|string} value */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Package/runtime agreement is checked without installing or downloading anything. @param {string} root */
export async function inspectRuntime(root) {
  const manifest = readJson(join(root, 'package.json'));
  const pinned = manifest.engines?.node;
  if (typeof pinned !== 'string' || process.versions.node !== pinned) {
    throw new Error('Use the exact Node version pinned in package.json.');
  }
  for (const file of ['.node-version', '.nvmrc']) {
    if (readFileSync(join(root, file), 'utf8').trim() !== pinned)
      throw new Error('Node pins disagree.');
  }
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'));
  if (!lock.equals(readFileSync(join(root, 'node_modules/.pnpm/lock.yaml')))) {
    throw new Error(
      'Installed dependencies do not match the committed lockfile; no installation was attempted.'
    );
  }
  const require = createRequire(join(root, 'package.json'));
  const { parse } = await import(pathToFileURL(require.resolve('yaml')).href);
  const importer = record(record(parse(lock.toString('utf8'))).importers)['.'];
  for (const kind of ['dependencies', 'devDependencies']) {
    const declared = record(manifest[kind] ?? {});
    const locked = record(importer[kind] ?? {});
    if (Object.keys(declared).sort().join() !== Object.keys(locked).sort().join()) {
      throw new Error('Manifest and lockfile dependency names disagree.');
    }
    for (const [name, version] of Object.entries(declared)) {
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
        throw new Error('Direct dependencies must use exact versions.');
      }
      if (
        locked[name]?.specifier !== version ||
        readJson(join(root, 'node_modules', name, 'package.json')).version !== version
      ) {
        throw new Error('Installed dependency, manifest and lockfile versions disagree.');
      }
    }
  }
  const { chromium, firefox, webkit } = require('@playwright/test');
  const engines = Object.fromEntries(
    Object.entries({ chromium, firefox, webkit }).map(([name, engine]) => [
      name,
      { executablePresent: existsSync(engine.executablePath()), selected: BROWSERS.includes(name) }
    ])
  );
  if (BROWSERS.some((name) => !engines[name].executablePresent))
    throw new Error(
      'An installed Chromium or WebKit executable is missing; no browser download was attempted.'
    );
  return { node: pinned, pnpm: manifest.packageManager, lockSha256: digest(lock), engines };
}

/** Hash actual tracked and nonignored source, including uncommitted edits. @param {string} root */
export function snapshotSource(root) {
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const names = [...new Set(output.toString('utf8').split('\0').filter(Boolean))].sort();
  if (!names.length || names.length > 100_000) throw new Error('Unexpected source inventory size.');
  let total = 0;
  const files = names.map((name) => {
    const path = resolve(root, name);
    if (relative(root, path).startsWith('..') || name.includes('\n'))
      throw new Error('Unsafe source path.');
    const stat = lstatSync(path);
    if ((!stat.isFile() && !stat.isSymbolicLink()) || stat.size > 128 * 1024 * 1024) {
      throw new Error('Unsupported source entry.');
    }
    total += stat.size;
    if (total > 1024 * 1024 * 1024) throw new Error('Source inventory exceeds its bound.');
    const contents = stat.isSymbolicLink() ? `symlink:${readlinkSync(path)}` : readFileSync(path);
    return { path: name, sha256: digest(contents) };
  });
  return { sha256: digest(JSON.stringify(files)), files };
}

/** @param {string} text @param {string} root */
export function redact(text, root) {
  return text
    .replaceAll(root, '<workspace>')
    .replaceAll(homedir(), '<home>')
    .replace(
      /(authorization|password|secret|token|credential)([=:]\s*)[^\s,;]+/gi,
      '$1$2<redacted>'
    );
}

/** @param {string} path @param {unknown} value */
function saveJson(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

/** @param {number} port */
export async function assertFreePort(port) {
  const server = createServer();
  server.listen({ host: '127.0.0.1', port, exclusive: true });
  try {
    await once(server, 'listening');
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

/** @param {NodeJS.ProcessEnv} inherited @param {string} node @returns {NodeJS.ProcessEnv} */
export function childEnvironment(inherited, node) {
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const name of [
    'HOME',
    'TMPDIR',
    'TEMP',
    'TMP',
    'SystemRoot',
    'XDG_CACHE_HOME',
    'PLAYWRIGHT_BROWSERS_PATH'
  ]) {
    if (inherited[name]) env[name] = inherited[name];
  }
  return {
    ...env,
    PATH: `${dirname(node)}:${inherited.PATH ?? '/usr/bin:/bin'}`,
    CI: '1',
    GROOT_MARKETPLACE_DISCOVERY: '0',
    pnpm_config_verify_deps_before_run: 'false',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'
  };
}

/** Spawn only pinned Node executables, in owned POSIX process groups. */
export class ProcessHarness {
  /** @type {Set<OwnedChild>} */
  children = new Set();

  /** @param {{root:string,node?:string,signal?:AbortSignal,onBlocked?:()=>void,stopGraceMs?:number,kill?:(pid:number,signal:NodeJS.Signals)=>void}} options */
  constructor(options) {
    this.root = realpathSync(options.root);
    this.node = options.node ?? process.execPath;
    this.signal = options.signal;
    this.onBlocked = options.onBlocked;
    this.stopGraceMs = options.stopGraceMs ?? STOP_GRACE_MS;
    this.kill = options.kill ?? process.kill;
  }

  /** @param {Command} command @returns {OwnedChild} */
  start(command) {
    if (this.signal?.aborted) throw new Error('Verification was cancelled.');
    const child = spawn(this.node, command.args, {
      cwd: this.root,
      env: command.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let log = '';
    let truncated = false;
    const append = (/** @type {Buffer} */ chunk) => {
      if (log.length + chunk.length <= 8 * 1024 * 1024) log += chunk.toString('utf8');
      else truncated = true;
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    let timedOut = false;
    let settled = false;
    /** @type {Promise<void>|undefined} */
    let stopping;
    let resolveReady = () => {};
    let rejectReady = (/** @type {Error} */ _error) => {};
    const ready = new Promise((resolve, reject) => {
      resolveReady = () => resolve(undefined);
      rejectReady = reject;
    });
    // A non-server command has no readiness consumer; suppress an unhandled rejection.
    ready.catch(() => {});
    child.on('message', (message) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      if (message.type === 'ready') resolveReady();
      if (message.type === 'blocked-network') this.onBlocked?.();
    });
    const send = (/** @type {NodeJS.Signals} */ signal) => {
      if (!child.pid) return;
      try {
        this.kill(-child.pid, signal);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') throw error;
      }
    };
    const stop = () => {
      if (stopping) return stopping;
      stopping = (async () => {
        // A closed child's old group identity is no longer ours to signal.
        // Only decide to stop while this exact child is still running.
        if (isRunning()) {
          send('SIGTERM');
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, this.stopGraceMs);
            void result.then(() => {
              clearTimeout(timer);
              resolve(undefined);
            });
          });
          if (isRunning()) send('SIGKILL');
        }
        await result;
        this.children.delete(owned);
      })();
      return stopping;
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      void stop();
    }, command.timeoutMs ?? TIMEOUT_MS);
    const aborted = () => void stop();
    this.signal?.addEventListener('abort', aborted, { once: true });
    const result = new Promise((resolve) => {
      const finish = (
        /** @type {number|null} */ code,
        /** @type {NodeJS.Signals|null} */ signal,
        /** @type {Error|undefined} */ error = undefined
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.signal?.removeEventListener('abort', aborted);
        if (error) append(Buffer.from(`\nChild process failed: ${error.message}\n`));
        if (truncated) log += '\n[Log truncated at 8 MiB; phase is incomplete.]\n';
        writeFileSync(command.log, redact(log, this.root), { mode: 0o600 });
        rejectReady(new Error('Owned server exited before readiness.'));
        resolve({ code: truncated ? 1 : code, signal, timedOut });
      };
      child.once('error', (error) => finish(1, null, error));
      child.once('close', (code, signal) => finish(code, signal));
    });
    const isRunning = () => !settled && child.exitCode === null && child.signalCode === null;
    const owned = {
      result: /** @type {Promise<Exit>} */ (result),
      ready,
      isRunning,
      stop
    };
    this.children.add(owned);
    return owned;
  }

  async close() {
    await Promise.all([...this.children].map((child) => child.stop()));
    this.children.clear();
  }
}

/** Identify the exact owned listener, without following redirects or reading a body. @param {number} port @param {string} nonce */
export async function identifyServer(port, nonce) {
  await new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/__groot_readiness',
        method: 'GET',
        headers: { 'X-Groot-Readiness': nonce },
        timeout: 2_000
      },
      (response) => {
        response.resume();
        if (response.statusCode !== 204 || response.headers['x-groot-readiness'] !== nonce) {
          reject(new Error('The listener is not the owned fixture server.'));
        } else resolve(undefined);
      }
    );
    req.once('error', reject);
    req.once('timeout', () => req.destroy(new Error('Owned-server identity timed out.')));
    req.end();
  });
}

/** @param {string} path */
function browserCases(path) {
  if (lstatSync(path).size > 8 * 1024 * 1024) throw new Error('Browser report is too large.');
  const report = readJson(path);
  /** @type {Record<string,any>[]} */
  const cases = [];
  const visit = (/** @type {Record<string,any>} */ suite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? [])
        cases.push({ ...test, identity: `${spec.id}/${test.projectName}` });
    for (const nested of suite.suites ?? []) visit(nested);
  };
  for (const suite of report.suites ?? []) visit(suite);
  if (report.errors?.length || !cases.length || cases.length > 10_000)
    throw new Error('Browser report is empty, too large or includes collection errors.');
  return cases;
}

/** @param {string} path */
export function listBrowserCases(path) {
  const cases = browserCases(path);
  if (cases.some((test) => test.expectedStatus !== 'passed'))
    throw new Error('Selected browser cases include a skipped or expected failure case.');
  const identities = cases.map((test) => test.identity).sort();
  if (new Set(identities).size !== identities.length)
    throw new Error('Browser case identities are not unique.');
  return identities;
}

/** @param {string} path @param {string[]} expected */
export function verifyBrowserReport(path, expected) {
  const cases = browserCases(path);
  if (JSON.stringify(cases.map((test) => test.identity).sort()) !== JSON.stringify(expected)) {
    throw new Error('Browser report is incomplete or its selected cases changed.');
  }
  for (const test of cases) {
    if (
      test.expectedStatus !== 'passed' ||
      test.status !== 'expected' ||
      test.results?.length !== 1 ||
      test.results[0].status !== 'passed' ||
      test.results[0].retry !== 0
    ) {
      throw new Error('Browser report includes failed, skipped, retried or incomplete cases.');
    }
  }
  return { passed: cases.length, failed: 0, skipped: 0, retries: 0 };
}

/**
 * Dependencies are injected only through this exported API for isolated fixtures, never CLI flags.
 * @param {{root?:string,options?:Options,signal?:AbortSignal,harness?:Harness,inspect?:typeof inspectRuntime,snapshot?:typeof snapshotSource,freePort?:typeof assertFreePort,identify?:typeof identifyServer,onProgress?:(message:string)=>void}} [configuration]
 */
export async function runVerification(configuration = {}) {
  const root = realpathSync(configuration.root ?? rootDefault);
  const options = parseOptions([
    `--passes=${configuration.options?.passes ?? 2}`,
    `--port=${configuration.options?.port ?? 5199}`
  ]);
  const directory = join(root, 'outputs/marketplace-readiness');
  mkdirSync(directory, { recursive: true });
  const nonce = randomBytes(24).toString('hex');
  const runId = `run-${new Date().toISOString().replaceAll(':', '-')}-${nonce.slice(0, 8)}`;
  const runDir = join(directory, runId);
  mkdirSync(runDir, { mode: 0o700 });
  const lockDir = join(directory, '.verification-lock');
  const localAbort = new AbortController();
  const cancel = () => localAbort.abort();
  configuration.signal?.addEventListener('abort', cancel, { once: true });
  if (configuration.signal?.aborted) cancel();
  const signal = localAbort.signal;
  /** @type {Record<string,any>} */
  const report = {
    schemaVersion: 1,
    runId,
    scope: SCOPE,
    status: 'running',
    startedAt: new Date().toISOString(),
    options,
    automaticRetries: 0,
    browserEngines: BROWSERS,
    outsideScope: [
      'canonical pnpm validate',
      'Rust/native/device acceptance',
      'live-provider integration and liquidity',
      'legal approval',
      'independent security audit',
      'production release certification'
    ],
    phases: [],
    serverLifecycles: [],
    secondaryErrors: []
  };
  report.passes = Array.from({ length: options.passes }, (_, index) => ({
    pass: index + 1,
    status: 'incomplete',
    engines: Object.fromEntries(BROWSERS.map((browser) => [browser, 'incomplete']))
  }));
  const reportPath = join(runDir, 'report.json');
  const save = () => saveJson(reportPath, report);
  const harness =
    configuration.harness ??
    new ProcessHarness({
      root,
      signal,
      onBlocked: () => {
        report.blockedOutboundFetch = true;
        cancel();
      }
    });
  let locked = false;
  const snapshot = configuration.snapshot ?? snapshotSource;
  let frozen = '';
  const unchanged = () => {
    if (snapshot(root).sha256 !== frozen)
      throw new Error(
        'Source changed during verification. Start a new run; evidence was preserved.'
      );
  };
  /** @param {string} id @param {string[]} args @param {NodeJS.ProcessEnv} env @param {string[]|undefined} [expected] */
  const phase = async (id, args, env, expected) => {
    if (signal.aborted) throw new Error('Verification was cancelled.');
    unchanged();
    const started = Date.now();
    const entry = {
      id,
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      exitCode: /** @type {number|null} */ (null),
      counts: /** @type {unknown} */ (null)
    };
    report.phases.push(entry);
    save();
    configuration.onProgress?.(`Starting ${id}`);
    try {
      const child = harness.start({ id, args, env, log: join(runDir, `${id}.log`) });
      const result = await child.result;
      await child.stop();
      entry.exitCode = result.code;
      if (signal.aborted || result.signal || result.timedOut || result.code !== 0)
        throw new Error(`${id} failed, timed out or was cancelled. See its preserved phase log.`);
      if (expected !== undefined) {
        entry.counts = verifyBrowserReport(env.GROOT_READINESS_JSON ?? '', expected);
        const browser = readJson(env.GROOT_READINESS_VERSION ?? '');
        if (
          browser.name !== env.GROOT_READINESS_BROWSER ||
          typeof browser.version !== 'string' ||
          browser.version.length > 100 ||
          !browser.version
        )
          throw new Error('Browser version evidence is missing or invalid.');
        Object.assign(entry, { browser: { name: browser.name, version: browser.version } });
      }
      unchanged();
      entry.status = 'passed';
    } catch (error) {
      entry.status = signal.aborted ? 'cancelled' : 'failed';
      Object.assign(entry, {
        error: redact(error instanceof Error ? error.message : 'Unknown phase failure.', root)
      });
      throw error;
    } finally {
      if (
        env.GROOT_READINESS_JSON &&
        existsSync(env.GROOT_READINESS_JSON) &&
        lstatSync(env.GROOT_READINESS_JSON).size <= 8 * 1024 * 1024
      ) {
        const json = readFileSync(env.GROOT_READINESS_JSON, 'utf8');
        writeFileSync(env.GROOT_READINESS_JSON, redact(json, root), { mode: 0o600 });
      }
      entry.durationMs = Date.now() - started;
      save();
    }
  };
  try {
    save();
    if (!['darwin', 'linux'].includes(process.platform))
      throw new Error('Owned process-group cleanup currently requires macOS or Linux.');
    mkdirSync(lockDir);
    locked = true;
    writeFileSync(join(lockDir, 'owner'), runId, { mode: 0o600 });
    await (configuration.freePort ?? assertFreePort)(options.port);
    report.runtime = await (configuration.inspect ?? inspectRuntime)(root);
    report.platform = { operatingSystem: process.platform, architecture: process.arch };
    const source = snapshot(root);
    frozen = source.sha256;
    report.sourceSha256 = frozen;
    saveJson(join(runDir, 'source-manifest.json'), source);
    chmodSync(join(runDir, 'source-manifest.json'), 0o400);
    const env = childEnvironment(process.env, process.execPath);
    const preflight = [
      ['format', ['node_modules/prettier/bin/prettier.cjs', '--check', '.']],
      ['sync', ['node_modules/@sveltejs/kit/svelte-kit.js', 'sync']],
      ['types', ['node_modules/svelte-check/bin/svelte-check', '--tsconfig', './tsconfig.json']],
      ['runner-fixtures', ['--test', 'scripts/marketplace/verify-readiness.test.mjs']],
      ['relay-fixtures', ['--test', 'scripts/marketplace/discovery-server.test.mjs']],
      ['units', ['node_modules/vitest/vitest.mjs', 'run']],
      ['build', ['node_modules/vite/bin/vite.js', 'build', '--mode', 'regtest']]
    ];
    for (const [id, args] of preflight)
      await phase(/** @type {string} */ (id), /** @type {string[]} */ (args), env);
    /** @type {Map<string,string[]>} */
    const inventories = new Map();
    for (const browser of BROWSERS)
      for (const suite of SUITES) {
        const collection = join(runDir, `inventory-${browser}-${suite.id}`);
        mkdirSync(collection);
        const args = [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config=scripts/marketplace/readiness-playwright.config.mjs',
          suite.file,
          '--list'
        ];
        if (suite.grep) args.push('--grep', suite.grep);
        const collectionEnv = {
          ...env,
          GROOT_MARKETPLACE_DISCOVERY: suite.flag,
          GROOT_READINESS_PORT: String(options.port),
          GROOT_READINESS_BROWSER: browser,
          GROOT_READINESS_JSON: join(collection, 'playwright.json'),
          GROOT_READINESS_RESULTS: join(collection, 'test-results')
        };
        await phase(`inventory-${browser}-${suite.id}`, args, collectionEnv);
        inventories.set(
          `${browser}:${suite.id}`,
          listBrowserCases(collectionEnv.GROOT_READINESS_JSON)
        );
      }
    report.caseInventories = Object.fromEntries(inventories);
    report.acceptanceStartedAt = new Date().toISOString();
    save();
    for (let pass = 1; pass <= options.passes; pass++) {
      report.passes[pass - 1].status = 'running';
      for (const browser of BROWSERS) {
        report.passes[pass - 1].engines[browser] = 'running';
        for (const flag of ['0', '1']) {
          if (signal.aborted) throw new Error('Verification was cancelled.');
          unchanged();
          const serverId = `pass-${pass}-${browser}-server-${flag}`;
          const serverStarted = Date.now();
          const lifecycle = {
            id: serverId,
            status: 'starting',
            startedAt: new Date().toISOString(),
            ready: false,
            runningBeforeExpectedStop: false,
            exitCode: /** @type {number|null} */ (null),
            signal: /** @type {NodeJS.Signals|null} */ (null),
            timedOut: false,
            durationMs: 0,
            stopProtocol: 'owned_sigterm'
          };
          report.serverLifecycles.push(lifecycle);
          save();
          const server = harness.start({
            id: serverId,
            args: ['scripts/marketplace/readiness-server.mjs'],
            env: {
              ...env,
              GROOT_MARKETPLACE_DISCOVERY: flag,
              GROOT_READINESS_PORT: String(options.port),
              GROOT_READINESS_NONCE: nonce
            },
            log: join(runDir, `${serverId}.log`),
            timeoutMs: 45 * 60_000,
            server: true
          });
          let primaryFailure = false;
          try {
            /** @type {ReturnType<typeof setTimeout>|undefined} */
            let timer;
            await Promise.race([
              server.ready,
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error('Owned server did not become ready.')),
                  45_000
                );
              })
            ]).finally(() => clearTimeout(timer));
            await (configuration.identify ?? identifyServer)(options.port, nonce);
            lifecycle.ready = true;
            lifecycle.status = 'running';
            save();
            for (const suite of SUITES.filter((suite) => suite.flag === flag)) {
              const id = `pass-${pass}-${browser}-${suite.id}`;
              const suiteDir = join(runDir, id);
              mkdirSync(suiteDir);
              const suiteEnv = {
                ...env,
                GROOT_MARKETPLACE_DISCOVERY: flag,
                GROOT_READINESS_PORT: String(options.port),
                GROOT_READINESS_BROWSER: browser,
                GROOT_READINESS_VERSION: join(suiteDir, 'browser-version.json'),
                GROOT_READINESS_JSON: join(suiteDir, 'playwright.json'),
                GROOT_READINESS_RESULTS: join(suiteDir, 'test-results'),
                MARKETPLACE_EVIDENCE_DIR: join(suiteDir, 'screenshots')
              };
              const args = [
                'node_modules/@playwright/test/cli.js',
                'test',
                '--config=scripts/marketplace/readiness-playwright.config.mjs',
                suite.file,
                '--workers=1',
                '--retries=0'
              ];
              if (suite.grep) args.push('--grep', suite.grep);
              await phase(id, args, suiteEnv, inventories.get(`${browser}:${suite.id}`));
            }
          } catch (error) {
            primaryFailure = true;
            throw error;
          } finally {
            try {
              lifecycle.runningBeforeExpectedStop = server.isRunning();
              await server.stop();
              const result = await server.result;
              lifecycle.exitCode = result.code;
              lifecycle.signal = result.signal;
              lifecycle.timedOut = Boolean(result.timedOut);
              // Vite can translate the SIGTERM we requested into exit 128 + 15.
              // Accept that only after confirming this exact child was still running.
              const stoppedByRequest =
                (!result.signal && (result.code === 0 || result.code === 143)) ||
                (result.signal === 'SIGTERM' && result.code === null);
              const expected =
                lifecycle.ready &&
                lifecycle.runningBeforeExpectedStop &&
                stoppedByRequest &&
                !result.timedOut;
              lifecycle.status = signal.aborted ? 'cancelled' : expected ? 'passed' : 'failed';
              if (!signal.aborted && !expected)
                throw new Error(
                  'Owned fixture server exited unexpectedly or did not stop cleanly; lifecycle evidence was preserved.'
                );
            } catch (error) {
              lifecycle.status = signal.aborted ? 'cancelled' : 'failed';
              const message = redact(
                error instanceof Error ? error.message : 'Owned server cleanup failed.',
                root
              );
              Object.assign(lifecycle, { error: message });
              if (primaryFailure) report.secondaryErrors.push({ id: serverId, error: message });
              else throw error;
            } finally {
              lifecycle.durationMs = Date.now() - serverStarted;
              save();
            }
          }
        }
        report.passes[pass - 1].engines[browser] = 'passed';
      }
      report.passes[pass - 1].status = 'passed';
    }
    unchanged();
    if (signal.aborted) throw new Error('Verification was cancelled.');
    report.status = 'passed';
  } catch (error) {
    report.status = signal.aborted ? 'cancelled' : 'failed';
    report.error = redact(
      error instanceof Error ? error.message : 'Unknown verification failure.',
      root
    );
  } finally {
    try {
      await harness.close();
    } catch {
      report.status = 'failed';
      report.cleanupError = 'Owned child cleanup failed.';
    }
    if (report.status === 'passed') {
      try {
        unchanged();
      } catch {
        report.status = 'failed';
        report.error = 'Source changed during final owned-process cleanup; evidence was preserved.';
      }
    }
    if (signal.aborted) {
      report.status = report.blockedOutboundFetch || report.cleanupError ? 'failed' : 'cancelled';
      if (report.blockedOutboundFetch)
        report.error = 'An upstream fetch was attempted and blocked by the fixture server.';
    }
    for (const pass of report.passes) {
      if (pass.status === 'running') pass.status = report.status;
      for (const browser of BROWSERS)
        if (pass.engines[browser] === 'running') pass.engines[browser] = report.status;
    }
    try {
      if (locked && readFileSync(join(lockDir, 'owner'), 'utf8') === runId)
        rmSync(lockDir, { recursive: true });
    } catch {
      report.status = 'failed';
      report.cleanupError = 'Workspace lock cleanup failed; inspect ownership before removing it.';
    }
    configuration.signal?.removeEventListener('abort', cancel);
    report.finishedAt = new Date().toISOString();
    save();
    saveJson(join(runDir, 'summary.json'), {
      scope: SCOPE,
      status: report.status,
      sourceSha256: report.sourceSha256 ?? null,
      passesRequested: options.passes,
      passes: report.passes,
      phases: report.phases,
      serverLifecycles: report.serverLifecycles,
      secondaryErrors: report.secondaryErrors,
      error: report.error ?? null
    });
  }
  return {
    report,
    directory: runDir,
    exitCode: report.status === 'passed' ? 0 : report.status === 'cancelled' ? 130 : 1
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).includes('--help')) {
    console.log(
      'Usage: node scripts/marketplace/verify-readiness.mjs [--passes=1..5] [--port=1024..65535]\nDefault: 2 complete passes, owned loopback port 5199, no retries or downloads.\n' +
        SCOPE
    );
  } else {
    const abort = new AbortController();
    process.once('SIGINT', () => abort.abort());
    process.once('SIGTERM', () => abort.abort());
    try {
      const result = await runVerification({
        options: parseOptions(process.argv.slice(2)),
        signal: abort.signal,
        onProgress: (message) => console.log(message)
      });
      console.log(`${result.report.status}: ${relative(rootDefault, result.directory)}\n${SCOPE}`);
      process.exitCode = result.exitCode;
    } catch {
      console.error(
        'Marketplace verification could not start. Check the pinned runtime, options and exclusive workspace/port ownership.'
      );
      process.exitCode = 1;
    }
  }
}
