#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CERTIFICATE_BYTES = 256 * 1024;
const MAX_DER_DEPTH = 32;
const MAX_DER_ELEMENTS = 8192;
const MINIMUM_GH_VERSION = [2, 102, 0];
const fullCommitPattern = /^[0-9a-f]{40}$/;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const deploymentEnvironmentOid = Buffer.from([
  0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, 0x17
]);
const tokenSubjectOid = Buffer.from([0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, 0x18]);

export const INTERNAL_ATTESTATION_POLICY = Object.freeze({
  repository: 'grootwallet/groot',
  repositoryId: '1321708536',
  repositoryOwnerId: '315751550',
  sourceRef: 'refs/heads/codex/post-53-maintainability',
  certificateIdentity:
    'https://github.com/grootwallet/groot/.github/workflows/experimental-desktop.yml@refs/heads/codex/post-53-maintainability',
  oidcIssuer: 'https://token.actions.githubusercontent.com',
  deploymentEnvironment: 'internal-candidate-approval',
  tokenSubject:
    'repo:grootwallet@315751550/groot@1321708536:environment:internal-candidate-approval'
});

function readDerElement(bytes, offset, limit) {
  if (offset < 0 || offset + 2 > limit) throw new Error('Truncated DER element');
  const tag = bytes[offset];
  if ((tag & 0x1f) === 0x1f) throw new Error('High-tag-number DER is not accepted');
  const firstLength = bytes[offset + 1];
  let contentStart = offset + 2;
  let length;
  if (firstLength < 0x80) {
    length = firstLength;
  } else {
    const lengthBytes = firstLength & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4 || contentStart + lengthBytes > limit) {
      throw new Error('Invalid DER length');
    }
    if (bytes[contentStart] === 0) throw new Error('Non-canonical DER length');
    length = 0;
    for (let index = 0; index < lengthBytes; index += 1) {
      length = length * 256 + bytes[contentStart + index];
    }
    if (length < 0x80) throw new Error('Non-canonical DER length');
    contentStart += lengthBytes;
  }
  const contentEnd = contentStart + length;
  if (!Number.isSafeInteger(contentEnd) || contentEnd > limit) {
    throw new Error('DER element exceeds its container');
  }
  return { tag, contentStart, contentEnd, nextOffset: contentEnd };
}

function directChildren(bytes, element) {
  const children = [];
  let offset = element.contentStart;
  while (offset < element.contentEnd) {
    if (children.length >= MAX_DER_ELEMENTS) throw new Error('DER element limit exceeded');
    const child = readDerElement(bytes, offset, element.contentEnd);
    children.push(child);
    offset = child.nextOffset;
  }
  if (offset !== element.contentEnd) throw new Error('Malformed DER container');
  return children;
}

function oidMatches(bytes, element, expected) {
  return (
    element.tag === 0x06 &&
    element.contentEnd - element.contentStart === expected.length &&
    bytes.subarray(element.contentStart, element.contentEnd).equals(expected)
  );
}

function decodeUtf8Extension(bytes, children) {
  let valueIndex = 1;
  if (children[valueIndex]?.tag === 0x01) {
    const critical = children[valueIndex];
    if (
      critical.contentEnd - critical.contentStart !== 1 ||
      ![0x00, 0xff].includes(bytes[critical.contentStart])
    ) {
      throw new Error('Malformed DER extension critical flag');
    }
    valueIndex += 1;
  }
  if (children.length !== valueIndex + 1 || children[valueIndex]?.tag !== 0x04) {
    throw new Error('Malformed signed certificate extension');
  }
  const wrapper = children[valueIndex];
  const value = readDerElement(bytes, wrapper.contentStart, wrapper.contentEnd);
  if (value.tag !== 0x0c || value.nextOffset !== wrapper.contentEnd) {
    throw new Error('Signed certificate extension is not one UTF8String');
  }
  return utf8Decoder.decode(bytes.subarray(value.contentStart, value.contentEnd));
}

export function extractProtectedEnvironmentExtensions(rawCertificate) {
  const bytes = Buffer.isBuffer(rawCertificate) ? rawCertificate : Buffer.from(rawCertificate);
  if (bytes.length === 0 || bytes.length > MAX_CERTIFICATE_BYTES) {
    throw new Error('Attestation certificate has an invalid size');
  }
  const root = readDerElement(bytes, 0, bytes.length);
  if (root.tag !== 0x30 || root.nextOffset !== bytes.length) {
    throw new Error('Attestation certificate is not one DER sequence');
  }
  const found = new Map([
    ['deploymentEnvironment', []],
    ['tokenSubject', []]
  ]);
  let visited = 0;

  function walk(element, depth) {
    if (depth > MAX_DER_DEPTH) throw new Error('DER nesting limit exceeded');
    visited += 1;
    if (visited > MAX_DER_ELEMENTS) throw new Error('DER element limit exceeded');
    if ((element.tag & 0x20) === 0) return;
    const children = directChildren(bytes, element);
    if (element.tag === 0x30 && children.length > 0) {
      if (oidMatches(bytes, children[0], deploymentEnvironmentOid)) {
        found.get('deploymentEnvironment').push(decodeUtf8Extension(bytes, children));
      }
      if (oidMatches(bytes, children[0], tokenSubjectOid)) {
        found.get('tokenSubject').push(decodeUtf8Extension(bytes, children));
      }
    }
    for (const child of children) walk(child, depth + 1);
  }

  walk(root, 0);
  for (const [name, values] of found) {
    if (values.length !== 1) {
      throw new Error(`Attestation certificate must contain exactly one ${name} extension`);
    }
  }
  return {
    deploymentEnvironment: found.get('deploymentEnvironment')[0],
    tokenSubject: found.get('tokenSubject')[0]
  };
}

function decodeRawCertificate(rawBytes) {
  if (
    typeof rawBytes !== 'string' ||
    rawBytes.length === 0 ||
    rawBytes.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(rawBytes)
  ) {
    throw new Error('Attestation certificate is not canonical base64');
  }
  const decoded = Buffer.from(rawBytes, 'base64');
  if (decoded.toString('base64') !== rawBytes) {
    throw new Error('Attestation certificate is not canonical base64');
  }
  return decoded;
}

function requireCertificateMetadata(result, commit) {
  const certificate = result?.verificationResult?.signature?.certificate;
  const expected = {
    subjectAlternativeName: INTERNAL_ATTESTATION_POLICY.certificateIdentity,
    issuer: INTERNAL_ATTESTATION_POLICY.oidcIssuer,
    buildSignerDigest: commit,
    runnerEnvironment: 'github-hosted',
    sourceRepositoryURI: `https://github.com/${INTERNAL_ATTESTATION_POLICY.repository}`,
    sourceRepositoryDigest: commit,
    sourceRepositoryRef: INTERNAL_ATTESTATION_POLICY.sourceRef,
    sourceRepositoryIdentifier: INTERNAL_ATTESTATION_POLICY.repositoryId,
    sourceRepositoryOwnerIdentifier: INTERNAL_ATTESTATION_POLICY.repositoryOwnerId,
    buildConfigURI: INTERNAL_ATTESTATION_POLICY.certificateIdentity,
    buildConfigDigest: commit
  };
  if (!certificate || typeof certificate !== 'object') {
    throw new Error('Attestation verification omitted signed certificate metadata');
  }
  for (const [field, value] of Object.entries(expected)) {
    if (certificate[field] !== value) {
      throw new Error(`Attestation certificate has an unexpected ${field}`);
    }
  }
}

function rawCertificateFrom(result) {
  const material = result?.attestation?.bundle?.verificationMaterial;
  return (
    material?.certificate?.rawBytes ?? material?.x509CertificateChain?.certificates?.[0]?.rawBytes
  );
}

export function assertApprovedAttestationResults(results, commit) {
  if (!fullCommitPattern.test(commit)) {
    throw new Error('The approved candidate must be one full lowercase commit SHA');
  }
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('GitHub returned no verified artifact attestations');
  }
  const failures = [];
  let accepted = 0;
  for (const result of results) {
    try {
      requireCertificateMetadata(result, commit);
      const extensions = extractProtectedEnvironmentExtensions(
        decodeRawCertificate(rawCertificateFrom(result))
      );
      if (extensions.deploymentEnvironment !== INTERNAL_ATTESTATION_POLICY.deploymentEnvironment) {
        throw new Error('Attestation was not signed in the protected approval Environment');
      }
      if (extensions.tokenSubject !== INTERNAL_ATTESTATION_POLICY.tokenSubject) {
        throw new Error('Attestation token subject does not bind the protected Environment');
      }
      accepted += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (accepted === 0) {
    throw new Error(`No attestation proves protected candidate approval: ${failures.join('; ')}`);
  }
  return accepted;
}

export function buildGhVerifyArguments(artifactPath, commit) {
  if (!fullCommitPattern.test(commit)) {
    throw new Error('The approved candidate must be one full lowercase commit SHA');
  }
  return [
    'attestation',
    'verify',
    artifactPath,
    '--repo',
    INTERNAL_ATTESTATION_POLICY.repository,
    '--cert-identity',
    INTERNAL_ATTESTATION_POLICY.certificateIdentity,
    '--cert-oidc-issuer',
    INTERNAL_ATTESTATION_POLICY.oidcIssuer,
    '--source-digest',
    commit,
    '--source-ref',
    INTERNAL_ATTESTATION_POLICY.sourceRef,
    '--signer-digest',
    commit,
    '--deny-self-hosted-runners',
    '--format',
    'json'
  ];
}

export function requireSafeGhVersion(output) {
  const match = /^gh version (\d+)\.(\d+)\.(\d+)\b/m.exec(output);
  if (!match) throw new Error('Unable to determine GitHub CLI version');
  const actual = match.slice(1).map(Number);
  for (let index = 0; index < MINIMUM_GH_VERSION.length; index += 1) {
    if (actual[index] > MINIMUM_GH_VERSION[index]) return actual.join('.');
    if (actual[index] < MINIMUM_GH_VERSION[index]) {
      throw new Error('GitHub CLI 2.102.0 or newer is required for safe attestation checks');
    }
  }
  return actual.join('.');
}

function verifyArtifact(artifactArgument, commit) {
  const artifactPath = resolve(artifactArgument);
  const metadata = lstatSync(artifactPath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size === 0) {
    throw new Error('The attestation subject must be a non-empty regular file');
  }
  requireSafeGhVersion(
    execFileSync('gh', ['--version'], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  );
  const output = execFileSync('gh', buildGhVerifyArguments(artifactPath, commit), {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  const accepted = assertApprovedAttestationResults(JSON.parse(output), commit);
  console.log(
    `Protected GitHub attestation verified for ${basename(artifactPath)} at ${commit} (${accepted} matching certificate${accepted === 1 ? '' : 's'})`
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) {
      throw new Error(
        'Usage: verify-internal-artifact-attestation.mjs /absolute/artifact FULL_40_CHARACTER_COMMIT'
      );
    }
    verifyArtifact(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
