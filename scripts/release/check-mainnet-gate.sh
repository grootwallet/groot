#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Mainnet release gate failed: $1" >&2
  exit 1
}

if command -v rg >/dev/null 2>&1; then
  contains_fixed() { rg -F -- "$1" "$2" >/dev/null; }
elif command -v grep >/dev/null 2>&1; then
  contains_fixed() { grep -F -- "$1" "$2" >/dev/null; }
else
  fail "ripgrep or grep is required"
fi

contains_fixed "export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest'] as const;" src/lib/config.ts \
  || fail "the browser network allowlist changed"
contains_fixed "const NETWORK: Network = Network::Regtest;" src-tauri/src/wallet.rs \
  || fail "the native wallet network is no longer pinned to regtest"
contains_fixed '"beforeBuildCommand": "pnpm build:regtest"' src-tauri/tauri.conf.json \
  || fail "the native build is no longer pinned to regtest mode"
contains_fixed "Mainnet remains disabled" docs/adr/0012-mainnet-release-gate.md \
  || fail "the accepted mainnet decision is missing"
contains_fixed "Release decision: BLOCKED" docs/mainnet-release-checklist.md \
  || fail "the release checklist is not explicitly blocked"

echo "Mainnet release gate: locked as expected."
