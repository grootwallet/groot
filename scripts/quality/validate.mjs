#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Keep the mandatory command as the single inventory of frontend obligations.
export function validationSteps(scripts, mode) {
  if (!['coverage', 'internal'].includes(mode)) throw new Error('Unknown validation mode');
  const steps = scripts.validate.split(' && ').map((command) => {
    const match = /^pnpm ([\w:-]+)$/.exec(command);
    if (!match || !scripts[match[1]]) throw new Error(`Unsupported validation step: ${command}`);
    return match[1];
  });
  if (
    steps.filter((step) => step === 'test').length !== 1 ||
    steps.filter((step) => step === 'test:release-gate').length !== 1
  ) {
    throw new Error('Validation must contain exactly one unit pass and release gate');
  }
  return steps.map((step) =>
    step === 'test'
      ? 'test:coverage'
      : mode === 'internal' && step === 'test:release-gate'
        ? 'test:release-gate:internal'
        : step
  );
}

export function runValidation(scripts, mode, execute) {
  for (const step of validationSteps(scripts, mode)) {
    const status = execute(step);
    if (status !== 0) return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode =
    process.argv[2] === '--coverage'
      ? 'coverage'
      : process.argv[2] === '--internal'
        ? 'internal'
        : undefined;
  if (process.argv.length !== 3 || !mode) throw new Error('Use --coverage or --internal');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).scripts;
  console.log(
    mode === 'internal'
      ? 'Internal acceptance: public source approval remains pending; every other gate must pass.'
      : 'Mandatory validation with one coverage-enabled unit pass.'
  );
  process.exitCode = runValidation(scripts, mode, (step) => {
    const started = performance.now();
    const result = spawnSync('pnpm', [step], {
      stdio: 'inherit',
      cwd: root,
      shell: process.platform === 'win32'
    });
    console.log(
      `Validation ${step}: ${result.status === 0 ? 'passed' : 'failed'} (${((performance.now() - started) / 1000).toFixed(1)}s)`
    );
    return result.error || result.signal ? 1 : result.status;
  });
}
