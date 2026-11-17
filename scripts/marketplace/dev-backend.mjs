import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ProcessHarness } from './verify-readiness.mjs';
import { walletRoot, resolveBackendSource, startSandbox } from './backend-process.mjs';

const source = resolveBackendSource();
const directory = join(
  walletRoot,
  'outputs/marketplace-backend/dev',
  new Date().toISOString().replaceAll(':', '-')
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const abort = new AbortController();
const harness = new ProcessHarness({
  root: walletRoot,
  signal: abort.signal,
  onBlocked: () => abort.abort()
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort());
try {
  const owned = await startSandbox({
    harness,
    source,
    directory,
    frontendPort: 5296,
    backendPort: 5200,
    database: join(source, '.data/marketplace-v1.sqlite'),
    nonce: randomBytes(24).toString('hex')
  });
  console.log(
    'Persistent sandbox ready: http://127.0.0.1:5296/marketplace/backend\nUse a disposable account/password. All money and escrow are simulated.'
  );
  await Promise.race([
    owned.frontend.result,
    owned.backend.result,
    new Promise((resolve) => abort.signal.addEventListener('abort', resolve, { once: true }))
  ]);
  if (!abort.signal.aborted)
    throw new Error('An owned sandbox service stopped unexpectedly; inspect local logs.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await harness.close();
}
