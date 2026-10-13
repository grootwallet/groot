#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const MH_MAGIC_64 = 0xfeedfacf;
const CPU_TYPE_ARM64 = 0x0100000c;
const MH_EXECUTE = 2;
const LC_UUID = 0x1b;
const LC_CODE_SIGNATURE = 0x1d;
const CSMAGIC_EMBEDDED_SIGNATURE = 0xfade0cc0;
const CSMAGIC_CODEDIRECTORY = 0xfade0c02;
const CSSLOT_CODEDIRECTORY = 0;
const CS_ADHOC = 0x2;
const CS_LINKER_SIGNED = 0x20000;
const CS_HASHTYPE_SHA256 = 2;
const CS_SUPPORTSEXECSEG = 0x20400;
const SHA256_SIZE = 32;
const CODE_PAGE_SIZE_POWER = 12;

function fail(message) {
  throw new Error(`Mach-O UUID normalization failed: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

function checkedRange(buffer, offset, size, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0) {
    fail(`${label} has an invalid range`);
  }
  if (offset > buffer.length || size > buffer.length - offset) {
    fail(`${label} exceeds the executable`);
  }
}

function findLoadCommands(buffer) {
  if (buffer.length < 32 || buffer.readUInt32LE(0) !== MH_MAGIC_64) {
    fail('input is not a thin little-endian 64-bit Mach-O executable');
  }
  if (buffer.readUInt32LE(4) !== CPU_TYPE_ARM64 || buffer.readUInt32LE(12) !== MH_EXECUTE) {
    fail('input is not an arm64 Mach-O executable');
  }
  const commandCount = buffer.readUInt32LE(16);
  const commandBytes = buffer.readUInt32LE(20);
  checkedRange(buffer, 32, commandBytes, 'Mach-O load commands');

  let offset = 32;
  let uuidOffset;
  let signature;
  for (let index = 0; index < commandCount; index += 1) {
    checkedRange(buffer, offset, 8, 'Mach-O load command');
    const command = buffer.readUInt32LE(offset);
    const commandSize = buffer.readUInt32LE(offset + 4);
    if (commandSize < 8 || commandSize % 4 !== 0) fail('Mach-O load command has an invalid size');
    checkedRange(buffer, offset, commandSize, 'Mach-O load command');
    if (command === LC_UUID) {
      if (uuidOffset !== undefined || commandSize !== 24)
        fail('expected exactly one valid LC_UUID');
      uuidOffset = offset + 8;
    } else if (command === LC_CODE_SIGNATURE) {
      if (signature !== undefined || commandSize !== 16) {
        fail('expected exactly one valid LC_CODE_SIGNATURE');
      }
      signature = {
        offset: buffer.readUInt32LE(offset + 8),
        size: buffer.readUInt32LE(offset + 12)
      };
    }
    offset += commandSize;
  }
  if (offset !== 32 + commandBytes) fail('Mach-O load-command size is inconsistent');
  if (uuidOffset === undefined) fail('LC_UUID is absent');
  if (signature === undefined) fail('LC_CODE_SIGNATURE is absent');
  checkedRange(buffer, uuidOffset, 16, 'LC_UUID');
  checkedRange(buffer, signature.offset, signature.size, 'embedded signature');
  if (signature.offset + signature.size !== buffer.length) {
    fail('embedded signature is not the final executable region');
  }
  return { uuidOffset, signature };
}

function findCodeDirectory(buffer, signature) {
  const start = signature.offset;
  checkedRange(buffer, start, 12, 'embedded signature header');
  if (buffer.readUInt32BE(start) !== CSMAGIC_EMBEDDED_SIGNATURE) {
    fail('embedded signature superblob has an unexpected magic');
  }
  const superblobLength = buffer.readUInt32BE(start + 4);
  const blobCount = buffer.readUInt32BE(start + 8);
  if (blobCount !== 1) fail('expected exactly one embedded signature blob');
  if (superblobLength > signature.size) fail('embedded signature length is inconsistent');
  checkedRange(buffer, start, superblobLength, 'embedded signature superblob');
  if (
    !buffer.subarray(start + superblobLength, start + signature.size).every((byte) => byte === 0)
  ) {
    fail('embedded signature padding is not zero-filled');
  }
  checkedRange(buffer, start + 12, blobCount * 8, 'embedded signature index');

  let codeDirectoryStart;
  for (let index = 0; index < blobCount; index += 1) {
    const entry = start + 12 + index * 8;
    const type = buffer.readUInt32BE(entry);
    const blobOffset = buffer.readUInt32BE(entry + 4);
    if (type === CSSLOT_CODEDIRECTORY) {
      if (codeDirectoryStart !== undefined)
        fail('multiple primary CodeDirectories are unsupported');
      codeDirectoryStart = start + blobOffset;
    }
  }
  if (codeDirectoryStart === undefined) fail('primary CodeDirectory is absent');
  checkedRange(buffer, codeDirectoryStart, 40, 'CodeDirectory header');
  if (buffer.readUInt32BE(codeDirectoryStart) !== CSMAGIC_CODEDIRECTORY) {
    fail('primary CodeDirectory has an unexpected magic');
  }

  const length = buffer.readUInt32BE(codeDirectoryStart + 4);
  const version = buffer.readUInt32BE(codeDirectoryStart + 8);
  const flags = buffer.readUInt32BE(codeDirectoryStart + 12);
  const hashOffset = buffer.readUInt32BE(codeDirectoryStart + 16);
  const specialSlots = buffer.readUInt32BE(codeDirectoryStart + 24);
  const codeSlots = buffer.readUInt32BE(codeDirectoryStart + 28);
  const codeLimit = buffer.readUInt32BE(codeDirectoryStart + 32);
  const hashSize = buffer[codeDirectoryStart + 36];
  const hashType = buffer[codeDirectoryStart + 37];
  const pageSizePower = buffer[codeDirectoryStart + 39];
  checkedRange(buffer, codeDirectoryStart, length, 'CodeDirectory');
  if (codeDirectoryStart + length !== start + superblobLength) {
    fail('CodeDirectory does not exactly fill the embedded signature superblob');
  }
  if (version !== CS_SUPPORTSEXECSEG) fail('primary CodeDirectory has an unexpected version');
  if (flags !== (CS_ADHOC | CS_LINKER_SIGNED)) {
    fail('primary CodeDirectory is not the expected linker-generated ad hoc signature');
  }
  if (hashType !== CS_HASHTYPE_SHA256 || hashSize !== SHA256_SIZE) {
    fail('primary CodeDirectory does not use full SHA-256 hashes');
  }
  if (specialSlots !== 0) fail('unexpected special CodeDirectory slots');
  if (pageSizePower !== CODE_PAGE_SIZE_POWER) fail('unexpected CodeDirectory page size');
  const pageSize = 2 ** pageSizePower;
  if (codeLimit !== signature.offset)
    fail('CodeDirectory code limit does not match signature offset');
  if (codeSlots !== Math.ceil(codeLimit / pageSize))
    fail('CodeDirectory slot count is inconsistent');
  const codeHashesStart = codeDirectoryStart + hashOffset;
  checkedRange(buffer, codeHashesStart, codeSlots * hashSize, 'CodeDirectory code hashes');
  if (codeHashesStart + codeSlots * hashSize !== codeDirectoryStart + length) {
    fail('CodeDirectory code hashes do not exactly fill the CodeDirectory');
  }
  return { codeHashesStart, codeLimit, codeSlots, hashSize, pageSize };
}

function verifyCodeHashes(buffer, codeDirectory) {
  for (let slot = 0; slot < codeDirectory.codeSlots; slot += 1) {
    const pageStart = slot * codeDirectory.pageSize;
    const pageEnd = Math.min(pageStart + codeDirectory.pageSize, codeDirectory.codeLimit);
    const expected = sha256(buffer.subarray(pageStart, pageEnd));
    const storedStart = codeDirectory.codeHashesStart + slot * codeDirectory.hashSize;
    const stored = buffer.subarray(storedStart, storedStart + codeDirectory.hashSize);
    if (!expected.equals(stored)) fail(`existing ad hoc code hash ${slot} is invalid`);
  }
}

function normalize(buffer) {
  const { uuidOffset, signature } = findLoadCommands(buffer);
  const codeDirectory = findCodeDirectory(buffer, signature);
  verifyCodeHashes(buffer, codeDirectory);
  if (uuidOffset + 16 > codeDirectory.codeLimit) fail('LC_UUID is outside signed code');

  buffer.fill(0, uuidOffset, uuidOffset + 16);
  const uuid = sha256(buffer.subarray(0, codeDirectory.codeLimit)).subarray(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x30;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  uuid.copy(buffer, uuidOffset);

  const firstChangedSlot = Math.floor(uuidOffset / codeDirectory.pageSize);
  const lastChangedSlot = Math.floor((uuidOffset + 15) / codeDirectory.pageSize);
  for (let slot = firstChangedSlot; slot <= lastChangedSlot; slot += 1) {
    const pageStart = slot * codeDirectory.pageSize;
    const pageEnd = Math.min(pageStart + codeDirectory.pageSize, codeDirectory.codeLimit);
    const digest = sha256(buffer.subarray(pageStart, pageEnd));
    digest.copy(buffer, codeDirectory.codeHashesStart + slot * codeDirectory.hashSize);
  }
  verifyCodeHashes(buffer, codeDirectory);
  return uuid;
}

const executable = process.argv[2];
if (!executable || process.argv.length !== 3) {
  console.error('Usage: node scripts/release/normalize-macho-uuid.mjs /absolute/path/to/Groot');
  process.exit(2);
}
if (!executable.startsWith('/')) fail('executable path must be absolute');
const metadata = lstatSync(executable);
if (metadata.isSymbolicLink() || !metadata.isFile())
  fail('executable must be a regular non-symlink file');

const buffer = readFileSync(executable);
const uuid = normalize(buffer);
const temporary = join(
  dirname(executable),
  `.${basename(executable)}.uuid-normalize-${process.pid}`
);
try {
  writeFileSync(temporary, buffer, { flag: 'wx', mode: metadata.mode });
  chmodSync(temporary, metadata.mode);
  renameSync(temporary, executable);
} finally {
  rmSync(temporary, { force: true });
}

const rendered = uuid.toString('hex').toUpperCase();
console.log(
  `Normalized Mach-O UUID: ${rendered.slice(0, 8)}-${rendered.slice(8, 12)}-${rendered.slice(12, 16)}-${rendered.slice(16, 20)}-${rendered.slice(20)}`
);
