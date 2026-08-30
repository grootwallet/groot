#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Agent scaffolding failed: $1" >&2
  exit 1
}

for guide in AGENTS.md docs/AGENTS.md src/AGENTS.md src-tauri/AGENTS.md e2e/AGENTS.md docs/agent-harness.md docs/bip-support.md .github/workflows/ci.yml; do
  [[ -f "${guide}" ]] || fail "missing ${guide}"
done

require_text() {
  local file="$1"
  local text="$2"
  grep -Fq -- "${text}" "${file}" || fail "${file} must include: ${text}"
}

require_text AGENTS.md 'docs/agent-harness.md'
require_text AGENTS.md 'docs/bip-support.md'
require_text README.md 'docs/bip-support.md'
require_text docs/implementation-status.md '[`bip-support.md`](bip-support.md)'
require_text docs/engineering-standards.md '[`bip-support.md`](bip-support.md)'
require_text docs/bip-support.md '## Implemented and in-progress BIPs'
require_text docs/bip-support.md '## Candidate BIPs'
require_text docs/bip-support.md '## Maintenance rule'
require_text docs/bip-support.md 'Upstream status'
require_text .github/pull_request_template.md 'BIP support matrix updated'
require_text docs/agent-harness.md 'pnpm validate'
require_text docs/agent-harness.md 'pnpm test:full'
require_text docs/agent-harness.md 'cargo clippy --locked --all-targets --all-features -- -D warnings'
require_text docs/agent-harness.md 'Trezor Safe 3'
require_text docs/agent-harness.md 'BitBox02 Nova'
require_text docs/agent-harness.md 'setup needed'
require_text docs/agent-harness.md 'Policy verified'
require_text docs/agent-harness.md 'gh issue view'
require_text docs/agent-harness.md '1180×780'
require_text docs/agent-harness.md '390×844'
require_text docs/engineering-standards.md 'explicit approval before creating a new reusable component'
require_text AGENTS.md 'Any breaking format change requires an ADR'
require_text docs/engineering-standards.md 'Persisted-format compatibility'
require_text docs/engineering-standards.md 'Approval must choose migration versus discard'
require_text docs/agent-harness.md 'migration-versus-'
require_text .github/workflows/ci.yml 'pnpm validate'
require_text .github/workflows/ci.yml 'pnpm test:sbom'
require_text .github/workflows/ci.yml 'pnpm test:acceptance'
require_text .github/workflows/ci.yml 'cargo clippy --locked --all-targets --all-features -- -D warnings'
require_text .github/workflows/ci.yml 'cargo test --locked --all-features'

node <<'NODE'
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const requiredScripts = [
  'format',
  'format:check',
  'check',
  'test',
  'test:acceptance',
  'test:agent-scaffolding',
  'test:coverage',
  'test:coverage:rust',
  'test:integration:regtest',
  'test:sbom',
  'test:full',
  'validate'
];

for (const script of requiredScripts) {
  if (!packageJson.scripts?.[script]) {
    console.error(`Agent scaffolding failed: package.json is missing ${script}`);
    process.exit(1);
  }
}

if (packageJson.engines?.node !== '24.19.0' || packageJson.engines?.pnpm !== '11.13.1') {
  console.error('Agent scaffolding failed: documented Node/pnpm pins drifted');
  process.exit(1);
}

if (!packageJson.scripts.validate.includes('pnpm test:agent-scaffolding')) {
  console.error('Agent scaffolding failed: validate does not run the scaffolding gate');
  process.exit(1);
}

if (readFileSync('.node-version', 'utf8').trim() !== '24.19.0') {
  console.error('Agent scaffolding failed: .node-version drifted');
  process.exit(1);
}

if (!readFileSync('rust-toolchain.toml', 'utf8').includes('channel = "1.97.1"')) {
  console.error('Agent scaffolding failed: rust-toolchain.toml drifted');
  process.exit(1);
}
NODE

echo "Agent scaffolding: complete and internally consistent."
