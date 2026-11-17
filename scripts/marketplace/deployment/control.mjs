import { execFileSync } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyBundle } from './verify-bundle.mjs';

/** Refuse namespace collisions before any initializer, start or stop command. */
export function assertDeploymentOwnership(project, environment = process.env) {
  if (!/^[a-z][a-z0-9-]{3,60}$/.test(project)) throw new Error('Invalid deployment name.');
  const run = (args) =>
    execFileSync('docker', args, {
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000
    }).trim();
  const assertLabels = (labels) => {
    if (
      labels?.['com.groot.marketplace.scope'] !== 'private-sandbox-v1' ||
      labels?.['com.docker.compose.project'] !== project
    )
      throw new Error('Deployment namespace belongs to another application.');
  };
  const containers = run([
    'ps',
    '--all',
    '--quiet',
    '--no-trunc',
    '--filter',
    `label=com.docker.compose.project=${project}`
  ])
    .split('\n')
    .filter(Boolean);
  for (const id of containers) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid container identity.');
    assertLabels(JSON.parse(run(['inspect', id]))[0].Config.Labels);
  }
  const networks = run([
    'network',
    'ls',
    '--quiet',
    '--no-trunc',
    '--filter',
    `label=com.docker.compose.project=${project}`
  ])
    .split('\n')
    .filter(Boolean);
  for (const id of networks) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid network identity.');
    assertLabels(JSON.parse(run(['network', 'inspect', id]))[0].Labels);
  }
  const volume = `${project}_state`;
  const hasVolume = run(['volume', 'ls', '--format', '{{.Name}}']).split('\n').includes(volume);
  if (hasVolume) assertLabels(JSON.parse(run(['volume', 'inspect', volume]))[0].Labels);
  return { containers, networks, volume: hasVolume ? volume : null };
}

/** Incident operations depend only on immutable, positively owned Docker IDs. */
export function inspectOrStopDeployment(action, environment = process.env) {
  if (!['down', 'status'].includes(action)) throw new Error('Choose down or status.');
  const project = environment.GROOT_SANDBOX_PROJECT ?? 'groot-marketplace-sandbox';
  const resources = assertDeploymentOwnership(project, environment);
  const run = (args) =>
    execFileSync('docker', args, {
      env: environment,
      stdio: 'inherit',
      timeout: 120000
    });
  if (action === 'status') {
    if (resources.containers.length)
      run([
        'container',
        'inspect',
        '--format',
        '{{.Id}} {{.Name}} {{.State.Status}}',
        ...resources.containers
      ]);
    else console.log(`No owned containers found for ${project}.`);
  } else {
    if (resources.containers.length) {
      run(['container', 'stop', '--timeout', '15', ...resources.containers]);
      run(['container', 'rm', ...resources.containers]);
    }
    for (const id of resources.networks) run(['network', 'rm', id]);
    console.log(`Owned containers stopped for ${project}; state volumes retained.`);
  }
  return resources;
}

export function deploymentEnvironment(environment, { validateTls = true } = {}) {
  if (typeof validateTls !== 'boolean') throw new Error('Invalid certificate validation option.');
  const origin = new URL(environment.GROOT_SANDBOX_ORIGIN ?? '');
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== environment.GROOT_SANDBOX_ORIGIN ||
    origin.username ||
    origin.password ||
    !/^[a-z0-9.:[\]-]+$/i.test(origin.host)
  )
    throw new Error('An exact HTTPS origin is required.');
  const bind = environment.GROOT_SANDBOX_BIND ?? '127.0.0.1';
  const port = environment.GROOT_SANDBOX_PORT ?? '5298';
  const project = environment.GROOT_SANDBOX_PROJECT ?? 'groot-marketplace-sandbox';
  if (
    !['127.0.0.1', '0.0.0.0'].includes(bind) ||
    !/^[1-9][0-9]{3,4}$/.test(port) ||
    Number(port) > 65535 ||
    Number(port) < 1024
  )
    throw new Error('Invalid sandbox listener.');
  if (!/^[a-z][a-z0-9-]{3,60}$/.test(project)) throw new Error('Invalid owned deployment name.');
  const hash = environment.GROOT_SANDBOX_ACCESS_HASH ?? '';
  if (!/^\$2[aby]\$(?:1[0-6])\$[./A-Za-z0-9]{53}$/.test(hash))
    throw new Error('A bcrypt access hash with cost 10..16 is required.');
  const certificates = environment.GROOT_SANDBOX_TLS_DIR ?? '';
  if (!isAbsolute(certificates) || /[\r\n\0]/.test(certificates))
    throw new Error('Use an absolute external TLS directory.');
  if (validateTls) {
    if (!lstatSync(certificates).isDirectory() || lstatSync(certificates).isSymbolicLink())
      throw new Error('TLS directory must be regular.');
    const material = {};
    for (const name of ['cert.pem', 'key.pem']) {
      const path = join(certificates, name);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || !stat.size)
        throw new Error('Invalid TLS file.');
      if (name === 'key.pem' && stat.mode & 0o077) throw new Error('TLS key must be private.');
      material[name] = readFileSync(path);
    }
    try {
      const certificate = new X509Certificate(material['cert.pem']);
      const privateKey = createPrivateKey(material['key.pem']);
      const hostname = origin.hostname.replace(/^\[|\]$/g, '');
      const matchesHost = isIP(hostname)
        ? certificate.checkIP(hostname)
        : certificate.checkHost(hostname, { subject: 'never' });
      const now = Date.now();
      const validFrom = Date.parse(certificate.validFrom);
      const validTo = Date.parse(certificate.validTo);
      if (
        !certificate.checkPrivateKey(privateKey) ||
        !matchesHost ||
        !Number.isFinite(validFrom) ||
        !Number.isFinite(validTo) ||
        now < validFrom ||
        now >= validTo
      )
        throw new Error('Rejected TLS material.');
    } catch {
      // OpenSSL errors can contain filenames and key-parser details. Keep the
      // public failure independent of the supplied private material.
      throw new Error('TLS certificate, private key, validity or hostname check failed.');
    }
  }
  return {
    ...environment,
    GROOT_SANDBOX_ORIGIN: origin.origin,
    GROOT_SANDBOX_AUTHORITY: origin.host,
    GROOT_SANDBOX_BIND: bind,
    GROOT_SANDBOX_PORT: port,
    GROOT_SANDBOX_PROJECT: project,
    GROOT_SANDBOX_TLS_DIR: certificates,
    GROOT_SANDBOX_ACCESS_HASH: hash
  };
}

export function control(action, environment = process.env) {
  if (process.versions.node !== '24.19.0') throw new Error('Use Node 24.19.0.');
  if (!['check', 'up', 'down', 'status'].includes(action))
    throw new Error('Choose check, up, status or down. State volumes are never deleted.');
  if (action === 'down' || action === 'status') return inspectOrStopDeployment(action, environment);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifyBundle(root);
  const env = deploymentEnvironment(environment, {
    validateTls: action === 'check' || action === 'up'
  });
  assertDeploymentOwnership(env.GROOT_SANDBOX_PROJECT, env);
  const args = [
    'compose',
    '--project-name',
    env.GROOT_SANDBOX_PROJECT,
    '--file',
    join(root, 'compose.yaml')
  ];
  const run = (extra) =>
    execFileSync('docker', [...args, ...extra], {
      cwd: root,
      env,
      stdio: 'inherit',
      timeout: 120000
    });
  if (action === 'check') run(['config', '--quiet']);
  else if (action === 'up') {
    run(['build', '--pull=false', 'edge']);
    run(['run', '--rm', '--no-deps', '--pull', 'never', 'initialize-state']);
    run(['up', '--detach', '--no-build', '--pull', 'never', 'edge', 'backend']);
    console.log(
      `Private sandbox containers launched for ${env.GROOT_SANDBOX_ORIGIN}/marketplace/backend. Verify TLS and private access before inviting testers; all money is simulated.`
    );
  } else throw new Error('Choose check or up.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Choose one action.');
    control(process.argv[2]);
  } catch {
    console.error('Sandbox operation rejected or failed. No live trading was enabled.');
    process.exitCode = 1;
  }
}
