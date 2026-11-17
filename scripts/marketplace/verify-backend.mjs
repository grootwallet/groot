import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ProcessHarness,
  childEnvironment,
  inspectRuntime,
  snapshotSource,
  listBrowserCases,
  verifyBrowserReport
} from './verify-readiness.mjs';
import { walletRoot, resolveBackendSource, startSandbox } from './backend-process.mjs';

const source = resolveBackendSource();
const lock = join(walletRoot, 'outputs/marketplace-backend/.verification-lock');
let locked = false;
if (process.argv.length > 2)
  throw new Error(
    'The backend browser verifier runs two complete passes without retries; no CLI overrides.'
  );
const directory = join(
  walletRoot,
  'outputs/marketplace-backend',
  `run-${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(6).toString('hex')}`
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const abort = new AbortController();
const harness = new ProcessHarness({
  root: walletRoot,
  signal: abort.signal,
  onBlocked: () => abort.abort()
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort());
const backendSnapshot = () => {
  const files = [];
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (['.git', '.data', 'outputs', 'node_modules'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error('Unsupported source symlink.');
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else
        files.push([
          relative(source, full),
          createHash('sha256').update(readFileSync(full)).digest('hex')
        ]);
    }
  };
  walk(source);
  return { files, sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex') };
};
const frontend = snapshotSource(walletRoot);
const backend = backendSnapshot();
const unchanged = () => {
  if (
    snapshotSource(walletRoot).sha256 !== frontend.sha256 ||
    backendSnapshot().sha256 !== backend.sha256
  )
    throw new Error('Source changed during verification. Start a new run; all evidence retained.');
};
const report = {
  schemaVersion: 1,
  scope:
    'Persistent sandbox API + SvelteKit integration; no real money/provider/native release certification.',
  startedAt: new Date().toISOString(),
  status: 'running',
  frontendSha256: frontend.sha256,
  backendSha256: backend.sha256,
  phases: [],
  servers: [],
  automaticRetries: 0
};
const save = () =>
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600
  });
writeFileSync(
  join(directory, 'source-manifests.json'),
  JSON.stringify({ frontend, backend }, null, 2) + '\n',
  { mode: 0o400 }
);
const env = {
  ...childEnvironment(process.env, process.execPath),
  GROOT_MARKETPLACE_BACKEND: '1',
  GROOT_READINESS_PORT: '5299'
};
async function phase(id, args, extra = {}, expected) {
  unchanged();
  const started = Date.now();
  console.log(`Starting ${id}`);
  const entry = { id, status: 'running' };
  report.phases.push(entry);
  save();
  const child = harness.start({
    id,
    args,
    env: { ...env, ...extra },
    log: join(directory, `${id}.log`)
  });
  const result = await child.result;
  await child.stop();
  Object.assign(entry, {
    durationMs: Date.now() - started,
    exitCode: result.code,
    signal: result.signal
  });
  if (result.code !== 0 || result.signal || result.timedOut || abort.signal.aborted) {
    entry.status = 'failed';
    save();
    throw new Error(`${id} failed. See retained log.`);
  }
  if (expected) entry.counts = verifyBrowserReport(extra.GROOT_READINESS_JSON, expected);
  unchanged();
  entry.status = 'passed';
  save();
}
try {
  save();
  mkdirSync(lock);
  locked = true;
  writeFileSync(join(lock, 'owner'), directory, { mode: 0o600 });
  report.runtime = await inspectRuntime(walletRoot);
  await phase('backend-three-passes', [join(source, 'scripts/verify.mjs')]);
  await phase('sync', ['node_modules/@sveltejs/kit/svelte-kit.js', 'sync']);
  await phase('types', [
    'node_modules/svelte-check/bin/svelte-check',
    '--tsconfig',
    './tsconfig.json'
  ]);
  await phase('units', ['node_modules/vitest/vitest.mjs', 'run']);
  await phase('build', ['node_modules/vite/bin/vite.js', 'build', '--mode', 'regtest']);
  const inventories = new Map();
  for (const browser of ['chromium', 'webkit']) {
    const json = join(directory, `inventory-${browser}.json`);
    await phase(
      `inventory-${browser}`,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config=scripts/marketplace/readiness-playwright.config.mjs',
        'e2e/marketplace-backend.spec.ts',
        '--list'
      ],
      {
        GROOT_READINESS_BROWSER: browser,
        GROOT_READINESS_JSON: json,
        GROOT_READINESS_RESULTS: join(directory, 'inventory-results')
      }
    );
    inventories.set(browser, listBrowserCases(json));
  }
  report.caseInventories = Object.fromEntries(inventories);
  save();
  for (let pass = 1; pass <= 2; pass++)
    for (const browser of ['chromium', 'webkit']) {
      const id = `pass-${pass}-${browser}`;
      const local = join(directory, id);
      mkdirSync(local, { mode: 0o700 });
      const owned = await startSandbox({
        harness,
        source,
        directory: local,
        frontendPort: 5299,
        backendPort: 5201,
        database: join(directory, 'sandbox/marketplace-v1.sqlite'),
        nonce: randomBytes(24).toString('hex')
      });
      try {
        await phase(
          id,
          [
            'node_modules/@playwright/test/cli.js',
            'test',
            '--config=scripts/marketplace/readiness-playwright.config.mjs',
            'e2e/marketplace-backend.spec.ts',
            '--workers=1',
            '--retries=0'
          ],
          {
            GROOT_READINESS_BROWSER: browser,
            GROOT_READINESS_JSON: join(local, 'playwright.json'),
            GROOT_READINESS_VERSION: join(local, 'browser-version.json'),
            GROOT_READINESS_RESULTS: join(local, 'test-results'),
            MARKETPLACE_BACKEND_EVIDENCE_DIR: join(local, 'screenshots')
          },
          inventories.get(browser)
        );
      } finally {
        for (const [kind, child] of Object.entries(owned)) {
          const running = child.isRunning();
          await child.stop();
          const result = await child.result;
          const okay =
            running &&
            !result.timedOut &&
            ((!result.signal && [0, 143].includes(result.code)) || result.signal === 'SIGTERM');
          report.servers.push({
            id,
            kind,
            runningBeforeStop: running,
            ...result,
            status: okay ? 'passed' : 'failed'
          });
          save();
          if (!okay) throw new Error('An owned server did not stop cleanly.');
        }
      }
    }
  unchanged();
  report.status = 'passed';
} catch (error) {
  report.status = abort.signal.aborted ? 'cancelled' : 'failed';
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await harness.close();
  try {
    unchanged();
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    process.exitCode = 1;
  }
  if (locked && readFileSync(join(lock, 'owner'), 'utf8') === directory)
    rmSync(lock, { recursive: true });
  report.finishedAt = new Date().toISOString();
  save();
  console.log(`${report.status}: ${join(directory, 'report.json')}`);
}
