#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { stripSourceComments } from './source-lexing.mjs';

const [needle, path] = process.argv.slice(2);
if (!needle || !path) process.exit(2);
process.exit(
  stripSourceComments(readFileSync(path, 'utf8'), { rust: path.endsWith('.rs') }).includes(needle)
    ? 0
    : 1
);
