#!/usr/bin/env node
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { availableParallelism, tmpdir } from 'node:os';

const independentChecks = [
  'format:check',
  'test:ci-harness',
  'test:boundaries',
  'test:marketplace-transport',
  'test:marketplace-provider',
  'test:release-gate',
  'test:agent-scaffolding',
  'test:ci-workflows',
  'test:secret-surfaces',
  'test:supply-chain',
  'test:brand',
  'test:versions',
  'test:localization',
  'test:hardware-preflight',
  'release:test:update',
  'release:test:hwi',
  'release:test:compare',
  'test:dev-runtime'
];

export function validationGroups(scripts, mode) {
  if (!['standard', 'coverage', 'internal'].includes(mode)) {
    throw new Error('Unknown validation mode');
  }

  const releaseGate = mode === 'internal' ? 'test:release-gate:internal' : 'test:release-gate';
  const unitTests = mode === 'standard' ? 'test' : 'test:coverage';
  const groups = [
    // These commands share SvelteKit output. Finish each before starting the next.
    ['check', unitTests, 'build'],
    ...independentChecks.map((step) => [step === 'test:release-gate' ? releaseGate : step])
  ];
  for (const step of groups.flat()) {
    if (!Object.hasOwn(scripts, step)) throw new Error(`Missing validation script: ${step}`);
  }
  return groups;
}

export async function runValidation(scripts, mode, execute, concurrency) {
  const groups = validationGroups(scripts, mode);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Validation concurrency must be a positive integer');
  }
  let nextGroup = 0;
  let failed = false;

  async function runWorker() {
    while (nextGroup < groups.length) {
      const group = groups[nextGroup++];
      for (const step of group) {
        if ((await execute(step)) !== 0) {
          failed = true;
          break;
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(groups.length, concurrency) }, runWorker);
  for (const result of await Promise.allSettled(workers)) {
    if (result.status === 'rejected') throw result.reason;
  }
  return failed ? 1 : 0;
}

async function runStep(root, outputDirectory, step) {
  const started = performance.now();
  const log = join(outputDirectory, step.replaceAll(':', '-') + '.log');
  const fd = openSync(log, 'wx', 0o600);
  let child;
  try {
    child = spawn('pnpm', [step], {
      stdio: ['ignore', fd, fd],
      cwd: root,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        VITEST_MAX_WORKERS: process.env.VITEST_MAX_WORKERS ?? '2'
      }
    });
  } finally {
    closeSync(fd);
  }
  const status = await new Promise((resolve) => {
    child.once('error', (error) => {
      console.error(`Could not start validation step ${step}: ${error.message}`);
    });
    child.once('close', resolve);
  });
  process.stdout.write(readFileSync(log));
  console.log(
    `Validation ${step}: ${status === 0 ? 'passed' : 'failed'} (${((performance.now() - started) / 1000).toFixed(1)}s)`
  );
  return status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = new Map([
    [undefined, 'standard'],
    ['--coverage', 'coverage'],
    ['--internal', 'internal']
  ]).get(process.argv[2]);
  if (process.argv.length > 3 || !mode) throw new Error('Use no option, --coverage or --internal');

  const root = fileURLToPath(new URL('../../', import.meta.url));
  const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).scripts;
  // Initialize rustup once before checks can invoke Cargo or rustc concurrently.
  const cargo = spawnSync('cargo', ['--version'], { cwd: root, stdio: 'inherit' });
  if (cargo.status !== 0) {
    throw new Error('Could not initialize the pinned Rust toolchain', { cause: cargo.error });
  }
  const outputDirectory = mkdtempSync(join(tmpdir(), 'groot-validation-'));
  const concurrency = Math.min(4, availableParallelism());
  const started = performance.now();
  if (mode === 'internal') console.log('Internal validation uses the internal source review gate.');
  try {
    process.exitCode = await runValidation(
      scripts,
      mode,
      (step) => runStep(root, outputDirectory, step),
      concurrency
    );
    console.log(`Validation finished in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}
