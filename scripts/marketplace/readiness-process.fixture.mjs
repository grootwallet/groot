import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [mode, path] = process.argv.slice(2);
if (mode === 'exit') {
  console.log(`workspace=${process.cwd()} password=fixture-only`);
  process.exit(0);
}
if (mode === 'block') {
  process.send?.({ type: 'blocked-network' });
}
if (mode === 'tree') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  writeFileSync(path, JSON.stringify({ parent: process.pid, descendant: child.pid }));
}
process.on('SIGTERM', () => {});
process.send?.({ type: 'ready' });
setInterval(() => {}, 1000);
