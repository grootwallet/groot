#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  isSourceApprovalRequired,
  validateMainnetSourcePolicy,
  validateMainnetSourceSemantics
} from './verify-mainnet-source-policy.mjs';

export function verifyInternalSourcePolicy(read, readBytes) {
  let pending = false;
  try {
    validateMainnetSourcePolicy(read, readBytes);
  } catch (error) {
    if (!isSourceApprovalRequired(error)) throw error;
    pending = true;
  }
  if (!pending)
    throw new Error('Internal candidate must retain the expected frozen source-approval stop');
  validateMainnetSourceSemantics(read);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    verifyInternalSourcePolicy(
      (path) => readFileSync(resolve(root, path), 'utf8'),
      (path) => readFileSync(resolve(root, path))
    );
    console.log('Internal source semantics passed; frozen public source approval remains pending.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
