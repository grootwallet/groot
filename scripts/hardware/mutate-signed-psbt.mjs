#!/usr/bin/env node
import {
  closeSync,
  constants,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';

const MAX_BYTES = 1024 * 1024;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function compactSize(bytes, offset) {
  if (offset >= bytes.length) throw new Error('The PSBT is truncated.');
  const first = bytes[offset];
  if (first < 0xfd) return [first, offset + 1];
  const width = first === 0xfd ? 2 : first === 0xfe ? 4 : 8;
  if (offset + 1 + width > bytes.length) throw new Error('The PSBT is truncated.');
  const value = Number(bytes.readBigUIntLE(offset + 1, width));
  if (!Number.isSafeInteger(value)) throw new Error('The PSBT field is too large.');
  return [value, offset + 1 + width];
}

function psbtMap(bytes, start) {
  const entries = [];
  let offset = start;
  while (true) {
    const [keyLength, afterKeyLength] = compactSize(bytes, offset);
    offset = afterKeyLength;
    if (keyLength === 0) return { entries, end: offset };
    if (keyLength > 1024 || offset + keyLength > bytes.length)
      throw new Error('The PSBT key is invalid.');
    const key = bytes.subarray(offset, offset + keyLength);
    offset += keyLength;
    const [valueLength, afterValueLength] = compactSize(bytes, offset);
    offset = afterValueLength;
    if (valueLength > MAX_BYTES || offset + valueLength > bytes.length)
      throw new Error('The PSBT value is invalid.');
    entries.push({ key, valueStart: offset, valueLength });
    offset += valueLength;
  }
}

function transactionShape(transaction) {
  let offset = 4;
  if (transaction.length < 10) throw new Error('The unsigned transaction is invalid.');
  let inputCount;
  [inputCount, offset] = compactSize(transaction, offset);
  if (inputCount < 1) throw new Error('The unsigned transaction has no inputs.');
  for (let index = 0; index < inputCount; index += 1) {
    if (offset + 36 > transaction.length) throw new Error('The unsigned transaction is truncated.');
    offset += 36;
    let scriptLength;
    [scriptLength, offset] = compactSize(transaction, offset);
    offset += scriptLength + 4;
    if (offset > transaction.length) throw new Error('The unsigned transaction is truncated.');
  }
  let outputCount;
  [outputCount, offset] = compactSize(transaction, offset);
  for (let index = 0; index < outputCount; index += 1) {
    if (offset + 8 > transaction.length) throw new Error('The unsigned transaction is truncated.');
    offset += 8;
    let scriptLength;
    [scriptLength, offset] = compactSize(transaction, offset);
    offset += scriptLength;
    if (offset > transaction.length) throw new Error('The unsigned transaction is truncated.');
  }
  if (offset + 4 !== transaction.length) throw new Error('The unsigned transaction is invalid.');
  return { inputCount, outputCount };
}

function decodePsbt(file) {
  if (file.subarray(0, 5).equals(Buffer.from('70736274ff', 'hex')))
    return { bytes: Buffer.from(file), text: false };
  const source = file.toString('utf8').trim();
  if (!source || !/^[A-Za-z0-9+/]+={0,2}$/.test(source))
    throw new Error('Choose a binary or base64 PSBT file.');
  const bytes = Buffer.from(source, 'base64');
  if (!bytes.subarray(0, 5).equals(Buffer.from('70736274ff', 'hex')))
    throw new Error('Choose a valid PSBT file.');
  return { bytes, text: true };
}

export function mutateSignedPsbt(file) {
  const decoded = decodePsbt(file);
  const bytes = decoded.bytes;
  const global = psbtMap(bytes, 5);
  const unsigned = global.entries.find((entry) => entry.key.length === 1 && entry.key[0] === 0x00);
  if (!unsigned) throw new Error('The PSBT has no unsigned transaction.');
  const shape = transactionShape(
    bytes.subarray(unsigned.valueStart, unsigned.valueStart + unsigned.valueLength)
  );
  let offset = global.end;
  let mutation = null;
  for (let index = 0; index < shape.inputCount; index += 1) {
    const input = psbtMap(bytes, offset);
    offset = input.end;
    if (!mutation) {
      const signature = input.entries.find(
        (entry) => entry.key[0] === 0x02 && (entry.key.length === 34 || entry.key.length === 66)
      );
      if (signature) {
        const value = bytes.subarray(
          signature.valueStart,
          signature.valueStart + signature.valueLength
        );
        if (value.length < 10 || value[0] !== 0x30 || value[2] !== 0x02)
          throw new Error('The partial signature is not a bounded DER signature.');
        const rLength = value[3];
        if (rLength < 2 || 4 + rLength + 3 > value.length)
          throw new Error('The partial signature is malformed.');
        mutation = signature.valueStart + 4 + Math.floor(rLength / 2);
      }
    }
  }
  for (let index = 0; index < shape.outputCount; index += 1) {
    const output = psbtMap(bytes, offset);
    offset = output.end;
  }
  if (offset !== bytes.length) throw new Error('The PSBT has trailing data.');
  if (mutation === null) throw new Error('The PSBT has no partial signature to mutate.');
  bytes[mutation] ^= 0x01;
  return decoded.text ? Buffer.from(`${bytes.toString('base64')}\n`) : bytes;
}

function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const outputIndex = args.indexOf('--output');
  if (args.length !== 4 || inputIndex < 0 || outputIndex < 0) {
    fail('Usage: mutate-signed-psbt.mjs --input SIGNED.psbt --output HOSTILE.psbt');
    return;
  }
  const input = resolve(args[inputIndex + 1]);
  const output = resolve(args[outputIndex + 1]);
  try {
    const metadata = lstatSync(input);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.size < 1 ||
      metadata.size > MAX_BYTES
    )
      throw new Error('Input must be a regular PSBT file of at most 1 MiB.');
    if (input === output) throw new Error('Input and output must be different files.');
    const inputReal = realpathSync(input);
    const outputParent = realpathSync(dirname(output));
    if (resolve(outputParent, output.split('/').at(-1)) === inputReal)
      throw new Error('Input and output must be different files.');
    const mutated = mutateSignedPsbt(readFileSync(input));
    const descriptor = openSync(
      output,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600
    );
    try {
      writeFileSync(descriptor, mutated);
    } finally {
      closeSync(descriptor);
    }
    process.stdout.write('Wrote one-byte hostile signature mutation.\n');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Could not create the hostile PSBT fixture.');
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname)
)
  main();
