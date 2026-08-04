#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Mainnet release gate failed: $1" >&2
  exit 1
}

rg -F "export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest'] as const;" src/lib/config.ts >/dev/null \
  || fail "the browser network allowlist changed"
rg -F "const NETWORK: Network = Network::Regtest;" src-tauri/src/wallet.rs >/dev/null \
  || fail "the native wallet network is no longer pinned to regtest"
rg -F '"beforeBuildCommand": "pnpm build:regtest"' src-tauri/tauri.conf.json >/dev/null \
  || fail "the native build is no longer pinned to regtest mode"
rg -F "Mainnet remains disabled" docs/adr/0012-mainnet-release-gate.md >/dev/null \
  || fail "the accepted mainnet decision is missing"
rg -F "Release decision: BLOCKED" docs/mainnet-release-checklist.md >/dev/null \
  || fail "the release checklist is not explicitly blocked"

echo "Mainnet release gate: locked as expected."
