#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { prepareHwiRuntime, verifyProductionHwiRuntime } from './prepare-hwi-runtime.mjs';
import { verifySignedHwiArtifact } from './verify-signed-hwi.mjs';

function fail(message) {
  throw new Error(`Signed HWI runtime failed: ${message}`);
}

const [action, hwiArgument, manifestArgument, runtimeArgument] = process.argv.slice(2);
if (
  !['prepare', 'verify'].includes(action) ||
  [hwiArgument, manifestArgument, runtimeArgument].some((value) => !value || !isAbsolute(value))
) {
  fail(
    'usage: signed-hwi-runtime.mjs prepare|verify /absolute/hwi /absolute/signed-hwi-manifest.json /absolute/runtime-directory'
  );
}
const teamId = process.env.GROOT_MACOS_SIGNING_TEAM_ID;
if (teamId !== '6Z85HGDUU7') fail('the 5.3.0 runtime requires the approved Developer ID team');
const identity = process.env.GROOT_MACOS_SIGNING_IDENTITY;
if (action === 'prepare' && !identity) fail('set GROOT_MACOS_SIGNING_IDENTITY');
const runtime = resolve(runtimeArgument);
if (action === 'prepare' && existsSync(runtime)) fail('runtime output already exists');

const signed = verifySignedHwiArtifact(hwiArgument, manifestArgument, teamId);
if (action === 'prepare') {
  prepareHwiRuntime(signed.hwi, runtime, signed.manifest.artifact.sha256, true, identity);
}
const manifestBytes = readFileSync(join(runtime, 'runtime-manifest.json'));
const runtimeDigest = createHash('sha256').update(manifestBytes).digest('hex');
const result = verifyProductionHwiRuntime(
  runtime,
  runtimeDigest,
  signed.manifest.artifact.sha256,
  teamId
);
console.log(
  `Signed HWI runtime verified: ${runtimeDigest}, ${result.fileCount} files, ${result.linkCount} links`
);
