#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function selectCiValidationScript(eventName, ref) {
  if (eventName === 'push' && ref === 'refs/heads/main') return 'validate:ci';
  if (eventName === 'pull_request' && typeof ref === 'string') {
    const match = /^refs\/pull\/([1-9][0-9]*)\/merge$/.exec(ref);
    if (match && match[0] === ref && Number.isSafeInteger(Number(match[1]))) {
      return 'validate:internal';
    }
  }
  throw new Error('Unsupported GitHub CI event/ref context');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('CI validation selector takes no arguments');
    console.log(selectCiValidationScript(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
