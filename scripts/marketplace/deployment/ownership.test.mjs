import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDeploymentOwnership, control } from './control.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const compose = readFileSync(join(directory, 'compose.yaml'), 'utf8');
const nodeImage = compose.match(/image: (node:[^\s]+)/)[1];
const caddyImage = readFileSync(join(directory, 'Dockerfile.edge'), 'utf8').match(
  /FROM (caddy:[^\s]+)/
)[1];
const run = (args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000
  }).trim();

test('foreign project resources are rejected before initialization or shutdown', () => {
  const project = `groot-foreign-fixture-${randomBytes(8).toString('hex')}`;
  const volume = `${project}_state`;
  const run = (args) =>
    execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000
    }).trim();
  run(['volume', 'create', '--label', 'com.groot.test-fixture=true', volume]);
  try {
    const before = run(['volume', 'inspect', volume]);
    assert.throws(() => assertDeploymentOwnership(project), /another application/);
    assert.equal(run(['volume', 'inspect', volume]), before);
  } finally {
    run(['volume', 'rm', volume]);
  }
  assertDeploymentOwnership(project);
  const network = run([
    'network',
    'create',
    '--internal',
    '--label',
    `com.docker.compose.project=${project}`,
    '--label',
    'com.groot.test-fixture=true',
    `${project}-fixture`
  ]);
  try {
    assert.throws(() => assertDeploymentOwnership(project), /another application/);
    assert.ok(JSON.parse(run(['network', 'inspect', network]))[0]);
  } finally {
    run(['network', 'rm', network]);
  }
});

test('incident shutdown works without deployment files or secrets and retains only owned state', () => {
  const project = `groot-incident-fixture-${randomBytes(8).toString('hex')}`;
  const volume = `${project}_state`;
  const labels = [
    '--label',
    `com.docker.compose.project=${project}`,
    '--label',
    'com.groot.marketplace.scope=private-sandbox-v1'
  ];
  let network;
  let container;
  run(['image', 'inspect', nodeImage]);
  run(['volume', 'create', ...labels, volume]);
  try {
    network = run(['network', 'create', '--internal', ...labels, `${project}-isolated`]);
    container = run([
      'run',
      '--pull',
      'never',
      '--detach',
      '--name',
      project,
      ...labels,
      '--network',
      network,
      '--read-only',
      '--user',
      '1000:1000',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--pids-limit',
      '32',
      '--memory',
      '128m',
      '--mount',
      `type=volume,src=${volume},dst=/state,readonly`,
      nodeImage,
      'node',
      '-e',
      'process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 1000)'
    ]);
    const volumeBefore = run(['volume', 'inspect', volume]);
    const environment = {
      ...process.env,
      GROOT_SANDBOX_PROJECT: project,
      GROOT_SANDBOX_ORIGIN: 'lost configuration',
      GROOT_SANDBOX_TLS_DIR: '/does/not/exist',
      GROOT_SANDBOX_ACCESS_HASH: ''
    };
    assert.deepEqual(control('status', environment).containers, [container]);
    control('down', environment);
    assert.equal(run(['ps', '--all', '--quiet', '--filter', `id=${container}`]), '');
    assert.equal(run(['network', 'ls', '--quiet', '--filter', `id=${network}`]), '');
    assert.equal(run(['volume', 'inspect', volume]), volumeBefore);
    assert.deepEqual(control('down', environment), {
      containers: [],
      networks: [],
      volume
    });
  } finally {
    if (container) {
      try {
        run(['rm', '--force', container]);
      } catch {}
    }
    if (network) {
      try {
        run(['network', 'rm', network]);
      } catch {}
    }
    run(['volume', 'rm', volume]);
  }
});

test('pinned Caddy discards HTTP error request headers and amounts during a real refused upstream', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'groot-caddy-privacy-'));
  const csrf = 'SYNTHETIC_CSRF_PRIVACY_SENTINEL';
  const cookie = 'SYNTHETIC_COOKIE_PRIVACY_SENTINEL';
  const authorization = 'SYNTHETIC_AUTH_PRIVACY_SENTINEL';
  const query = 'amountCents=654321';
  run(['image', 'inspect', caddyImage]);
  const observe = async (config) => {
    const name = `groot-privacy-fixture-${randomBytes(8).toString('hex')}`;
    const path = join(temporary, `${name}.Caddyfile`);
    // Public, synthetic configuration; no credentials or certificate material.
    writeFileSync(path, config, { mode: 0o644 });
    try {
      run([
        'run',
        '--pull',
        'never',
        '--detach',
        '--name',
        name,
        '--label',
        'com.groot.test-fixture=true',
        '--network',
        'none',
        '--read-only',
        '--user',
        '1000:1000',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        '--pids-limit',
        '32',
        '--memory',
        '128m',
        '--tmpfs',
        '/tmp:rw,exec,nosuid,uid=1000,gid=1000,mode=0700',
        '--mount',
        `type=bind,src=${path},dst=/etc/caddy/Caddyfile,readonly`,
        '--env',
        'GROOT_SANDBOX_AUTHORITY=127.0.0.1:8443',
        '--env',
        'XDG_CONFIG_HOME=/tmp/config',
        '--env',
        'XDG_DATA_HOME=/tmp/data',
        '--entrypoint',
        '/bin/sh',
        caddyImage,
        '-c',
        // Copying the pinned binary drops the unnecessary low-port file capability,
        // exactly as Dockerfile.edge does, without requiring a shared image tag.
        'cp /usr/bin/caddy /tmp/caddy && chmod 755 /tmp/caddy && exec /tmp/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile'
      ]);
      let response = '';
      for (let attempt = 0; attempt < 40; attempt++) {
        const request = spawnSync(
          'docker',
          [
            'exec',
            name,
            'wget',
            '-S',
            '-O',
            '-',
            '--header',
            `X-Groot-Marketplace-CSRF: ${csrf}`,
            '--header',
            `Cookie: synthetic=${cookie}`,
            '--header',
            `Authorization: Basic ${authorization}`,
            `http://127.0.0.1:8443/v1/offers?${query}`
          ],
          { encoding: 'utf8', timeout: 15000 }
        );
        response = request.stdout + request.stderr;
        if (response.includes('502')) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(response.includes('502'), 'The actual local upstream must refuse the request.');
      const observed = spawnSync('docker', ['logs', name], {
        encoding: 'utf8',
        timeout: 15000
      });
      assert.equal(observed.status, 0);
      return observed.stdout + observed.stderr;
    } finally {
      try {
        run(['rm', '--force', name]);
      } catch {}
    }
  };
  try {
    const baseline = await observe(`{
 admin off
 auto_https off
 persist_config off
}
:8443 {
 log {
  output discard
 }
 reverse_proxy 127.0.0.1:9
}
`);
    assert.ok(baseline.includes(csrf), 'Access-log discard alone must reproduce the header leak.');
    assert.ok(baseline.includes(query), 'Access-log discard alone must reproduce the amount leak.');
    assert.equal(baseline.includes(cookie), false);
    assert.equal(baseline.includes(authorization), false);
    const template = readFileSync(join(directory, 'Caddyfile'), 'utf8');
    const configured = template
      .replace('tls /certs/cert.pem /certs/key.pem', '')
      .replace(/        basic_auth \{\n            tester [^\n]+\n        \}\n/, '')
      .replace('reverse_proxy backend:5200', 'reverse_proxy 127.0.0.1:9')
      .replace('@@CSP@@', "default-src 'none'");
    assert.ok(!configured.includes('basic_auth'));
    // The template's actual global logging and HTTP routes remain intact. TLS
    // and the invitation gate are already exercised by deployment acceptance.
    const privateLogs = await observe(configured);
    for (const sentinel of [csrf, cookie, authorization, query])
      assert.equal(
        privateLogs.includes(sentinel),
        false,
        'Request data must not reach runtime logs.'
      );
    assert.ok(
      privateLogs.includes('serving initial configuration'),
      'Nonsensitive runtime logging remains available.'
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
