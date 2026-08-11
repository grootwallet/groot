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
contains_fixed "const MAINNET_ENABLED: bool = false;" src-tauri/src/release_policy.rs \
  || fail "the trusted-boundary mainnet gate is no longer disabled"
contains_fixed "ensure_runtime_network_enabled(NETWORK)" src-tauri/src/wallet.rs \
  || fail "wallet databases are no longer guarded before opening"
contains_fixed '"beforeBuildCommand": "pnpm build:regtest"' src-tauri/tauri.conf.json \
  || fail "the native build is no longer pinned to regtest mode"
contains_fixed "Mainnet remains disabled" docs/adr/0012-mainnet-release-gate.md \
  || fail "the accepted mainnet decision is missing"
contains_fixed "Release decision: BLOCKED" docs/mainnet-release-checklist.md \
  || fail "the release checklist is not explicitly blocked"
contains_fixed "Candidate scope: first mainnet release is macOS desktop only" docs/mainnet-release-checklist.md \
  || fail "the first-release platform scope is missing from the checklist"
contains_fixed "The first production target is a **macOS desktop" docs/roadmap.md \
  || fail "the roadmap no longer matches the first-release platform scope"
contains_fixed "A second Groot process cannot concurrently mutate" docs/mainnet-release-checklist.md \
  || fail "cross-process locking is missing from the mainnet blockers"
contains_fixed "The packaged HWI binary/source" docs/mainnet-release-checklist.md \
  || fail "packaged HWI verification is missing from the mainnet blockers"
contains_fixed "Coldcard Mk4" docs/mainnet-release-checklist.md \
  || fail "the Coldcard certification target is not model-specific"
contains_fixed "Trezor Model One" docs/mainnet-release-checklist.md \
  || fail "the Trezor certification target is not model-specific"
contains_fixed "BitBox02 Nova" docs/mainnet-release-checklist.md \
  || fail "the Nova support decision is missing from the hardware matrix"
contains_fixed "Blockstream Jade" docs/mainnet-release-checklist.md \
  || fail "the required Jade certification row is missing"
contains_fixed "secure-storage and lifecycle certification for every platform included in that candidate" docs/mainnet-threat-model.md \
  || fail "the threat model no longer scopes platform evidence to the candidate"

echo "Mainnet release gate: locked as expected."
