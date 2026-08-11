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

reject_fixed() {
  if contains_fixed "$1" "$2"; then
    fail "$3"
  fi
}

contains_fixed "export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest'] as const;" src/lib/config.ts \
  || fail "the browser network allowlist changed"
contains_fixed '"regtest" | "signet" | "testnet4" => {}' src-tauri/build.rs \
  || fail "the native compile-time network allowlist changed"
contains_fixed "mainnet is not compiled into this release" src-tauri/build.rs \
  || fail "the native build no longer rejects mainnet explicitly"
reject_fixed "pub const NETWORK: Network = Network::Bitcoin" src-tauri/src/build_network.rs \
  "the native build module can select Bitcoin mainnet"
contains_fixed "NAME as NETWORK_NAME, NETWORK, PARAMETERS," src-tauri/src/wallet.rs \
  || fail "the wallet no longer consumes the compile-time network identity"
contains_fixed "const MAINNET_ENABLED: bool = false;" src-tauri/src/release_policy.rs \
  || fail "the trusted-boundary mainnet gate is no longer disabled"
contains_fixed "ensure_runtime_network_enabled(NETWORK)" src-tauri/src/wallet.rs \
  || fail "wallet databases are no longer guarded before opening"
contains_fixed "backend.validate().is_err()" src-tauri/src/release_policy.rs \
  || fail "the first-mainnet local-Core policy no longer revalidates its loopback endpoint"
contains_fixed ".estimate_smart_fee(blocks, Some(mode))" src-tauri/src/wallet.rs \
  || fail "public-network fees no longer come from the configured Bitcoin Core node"
contains_fixed "if IS_REGTEST" src-tauri/src/wallet.rs \
  || fail "the deterministic fee policy is no longer visibly confined to Regtest"
reject_fixed "estimates?.economy ?? 1" src/routes/send/+page.svelte \
  "the send flow silently restored a fallback economy fee"
reject_fixed "estimates?.standard ?? 2" src/routes/send/+page.svelte \
  "the send flow silently restored a fallback standard fee"
reject_fixed "estimates?.priority ?? 5" src/routes/send/+page.svelte \
  "the send flow silently restored a fallback priority fee"
contains_fixed '"beforeBuildCommand": "pnpm build:regtest"' src-tauri/tauri.conf.json \
  || fail "the native build is no longer pinned to regtest mode"
contains_fixed '"identifier": "app.groot.wallet.signet"' src-tauri/tauri.signet.conf.json \
  || fail "the Signet rehearsal no longer has isolated application storage"
contains_fixed '"identifier": "app.groot.wallet.testnet4"' src-tauri/tauri.testnet4.conf.json \
  || fail "the Testnet4 rehearsal no longer has isolated application storage"
contains_fixed "Mainnet remains disabled" docs/adr/0012-mainnet-release-gate.md \
  || fail "the accepted mainnet decision is missing"
contains_fixed "singlesig_account_path: \"m/84'/0'/0'\"" src-tauri/src/build_network.rs \
  || fail "the dormant mainnet BIP84 account path is no longer explicit"
contains_fixed "multisig_account_path: \"m/48'/0'/0'/2'\"" src-tauri/src/build_network.rs \
  || fail "the dormant mainnet BIP48 account path is no longer explicit"
contains_fixed 'hwi_chain: "main"' src-tauri/src/build_network.rs \
  || fail "the dormant mainnet HWI chain is no longer explicit"
contains_fixed 'address_hrp: "bc"' src-tauri/src/build_network.rs \
  || fail "the dormant mainnet address family is no longer explicit"
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
