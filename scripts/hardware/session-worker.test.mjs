import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('isolated HWI session proves full identity before one action and closes on failure', () => {
  execFileSync(
    'python3',
    ['-B', fileURLToPath(new URL('./session-worker.test.py', import.meta.url))],
    {
      timeout: 30_000,
      stdio: 'pipe'
    }
  );
});
