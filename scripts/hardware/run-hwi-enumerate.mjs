import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MAX_OUTPUT_BYTES = 1024 * 1024;
const ENUMERATION_TIMEOUT_MS = 30_000;

export const runBounded = (executable, args, timeoutMs = ENUMERATION_TIMEOUT_MS) =>
  spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    killSignal: 'SIGKILL'
  });

const run = () => {
  const executable = process.argv[2];
  if (!executable || !executable.startsWith('/')) {
    console.error('GROOT_HWI_INVALID_EXECUTABLE');
    process.exitCode = 126;
    return;
  }

  const result = runBounded(executable, ['--chain', 'regtest', 'enumerate']);
  if (result.error?.code === 'ETIMEDOUT') {
    console.error('GROOT_HWI_ENUMERATION_TIMEOUT');
    process.exitCode = 124;
    return;
  }
  if (result.error?.code === 'ENOBUFS') {
    console.error('GROOT_HWI_ENUMERATION_OUTPUT_LIMIT');
    process.exitCode = 125;
    return;
  }
  if (result.error) {
    console.error('GROOT_HWI_ENUMERATION_FAILED');
    process.exitCode = 1;
    return;
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
