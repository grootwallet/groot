#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Mainnet release gate failed: $1" >&2
  exit 1
}

if command -v rg >/dev/null 2>&1; then
  search_fixed() { rg -F -- "$1" "$2" >/dev/null; }
elif command -v grep >/dev/null 2>&1; then
  search_fixed() { grep -F -- "$1" "$2" >/dev/null; }
else
  fail "ripgrep or grep is required"
fi

contains_fixed() {
  case "$2" in
    *.rs|*.ts|*.svelte|*.js|*.mjs) node scripts/quality/source-contains.mjs "$1" "$2" ;;
    *) search_fixed "$1" "$2" ;;
  esac
}

reject_fixed() {
  if contains_fixed "$1" "$2"; then
    fail "$3"
  fi
}

contains_fixed "export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest', 'mainnet'] as const;" src/lib/config.ts \
  || fail "the browser network allowlist changed"
contains_fixed '"regtest" | "signet" | "testnet4" | "mainnet" | "multi" => {}' src-tauri/build.rs \
  || fail "the native compile-time network allowlist changed"
node scripts/release/verify-mainnet-source-policy.mjs
contains_fixed '"status": "blocked"' docs/mainnet-release-authorization.json \
  || fail "the source-controlled public-release authorization is no longer blocked"
contains_fixed '"authorizedCommit": null' docs/mainnet-release-authorization.json \
  || fail "the blocked authorization record unexpectedly names a commit"
contains_fixed "verifyPublicReleaseAuthorization({ repoRoot, commit });" scripts/release/package-macos-ga.mjs \
  || fail "the production packager no longer enforces exact-commit release authorization"
contains_fixed "default_rpc_url, is_regtest, name as network_name, network, parameters," src-tauri/src/wallet.rs \
  || fail "the wallet no longer consumes the process-lifetime network identity"
contains_fixed "backend.validate().is_err()" src-tauri/src/release_policy.rs \
  || fail "the first-mainnet Core policy no longer revalidates its selected endpoint"
contains_fixed 'ChainBackend::RemoteCore { url } => (url, "https")' src-tauri/src/release_policy.rs \
  || fail "the first-mainnet remote-Core policy is not visibly HTTPS-only"
contains_fixed ".estimate_smart_fee(blocks, Some(mode))" src-tauri/src/wallet/profile_commands.rs \
  || fail "public-network fees no longer come from the configured Bitcoin Core node"
contains_fixed "if is_regtest()" src-tauri/src/wallet/profile_commands.rs \
  || fail "the deterministic fee policy is no longer visibly confined to Regtest"
reject_fixed "estimates?.economy ?? 1" src/routes/send/+page.svelte \
  "the send flow silently restored a fallback economy fee"
reject_fixed "estimates?.standard ?? 2" src/routes/send/+page.svelte \
  "the send flow silently restored a fallback standard fee"
reject_fixed "estimates?.priority ?? 5" src/routes/send/+page.svelte \
  "the send flow silently restored a fallback priority fee"
contains_fixed '"beforeBuildCommand": "pnpm build:regtest"' src-tauri/tauri.conf.json \
  || fail "the native build is no longer pinned to regtest mode"
contains_fixed '"beforeBuildCommand": "pnpm build:multi"' src-tauri/tauri.multi.conf.json \
  || fail "the internal network-switching build is not pinned to multi mode"
contains_fixed '"identifier": "app.groot.wallet"' src-tauri/tauri.multi.conf.json \
  || fail "the internal network-switching build no longer shares the legacy Regtest namespace"
contains_fixed '"identifier": "app.groot.wallet.signet"' src-tauri/tauri.signet.conf.json \
  || fail "the Signet rehearsal no longer has isolated application storage"
contains_fixed '"identifier": "app.groot.wallet.testnet4"' src-tauri/tauri.testnet4.conf.json \
  || fail "the Testnet4 rehearsal no longer has isolated application storage"
contains_fixed '"identifier": "app.groot.wallet.mainnet"' src-tauri/tauri.mainnet.conf.json \
  || fail "the mainnet candidate does not have isolated application storage"
contains_fixed '"beforeBuildCommand": "pnpm build:mainnet"' src-tauri/tauri.mainnet.conf.json \
  || fail "the mainnet candidate frontend is not build-bound to mainnet"
contains_fixed "export GROOT_BUILD_NETWORK=mainnet" scripts/release/build-unsigned-mainnet.sh \
  || fail "the unsigned mainnet evidence builder is not network-bound"
contains_fixed "--features tauri/custom-protocol" scripts/release/build-unsigned-mainnet.sh \
  || fail "the unsigned mainnet evidence builder is not using Tauri's production protocol mode"
contains_fixed "export GROOT_BUILD_NETWORK=multi" scripts/release/build-unsigned-multi.sh \
  || fail "the unsigned GA evidence builder is not multi-network bound"
contains_fixed "TAURI_ENV_PLATFORM=macos pnpm build:multi" scripts/release/build-unsigned-multi.sh \
  || fail "the unsigned GA evidence builder is not compiling the native frontend"
contains_fixed "verify-native-frontend-output.mjs build" scripts/release/build-unsigned-multi.sh \
  || fail "the unsigned GA evidence builder does not verify the native frontend"
contains_fixed "verify-signed-hwi.mjs" scripts/release/build-unsigned-multi.sh \
  || fail "the unsigned GA evidence builder is not bound to the production-signed HWI input"
contains_fixed "TAURI_ENV_PLATFORM=macos pnpm build:multi" scripts/release/build-packaged-macos-app.sh \
  || fail "the production package builder is not compiling the native frontend"
contains_fixed "verify-native-frontend-output.mjs build" scripts/release/build-packaged-macos-app.sh \
  || fail "the production package builder does not verify the native frontend"
contains_fixed "packaged pre-sign executable differs from the independently reproduced executable" scripts/release/package-macos-ga.mjs \
  || fail "the production package no longer binds the exact reproduced executable before signing"
contains_fixed "'notarytool'" scripts/release/package-macos-ga.mjs \
  || fail "the production package no longer requires Apple notarization"
contains_fixed "'stapler', 'staple'" scripts/release/package-macos-ga.mjs \
  || fail "the production package no longer staples the notarization ticket"
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
contains_fixed "Candidate scope: first mainnet release is macOS desktop on Apple silicon, includes BIP84 software single-key wallets" docs/mainnet-release-checklist.md \
  || fail "the first-release platform scope is missing from the checklist"
contains_fixed "The first limited mainnet candidate includes:" docs/adr/0052-first-mainnet-software-and-hardware-scope.md \
  || fail "the first-release software and hardware wallet scope decision is missing"
contains_fixed "mainnet candidate remains blocked from distribution" docs/adr/0052-first-mainnet-software-and-hardware-scope.md \
  || fail "the software and hardware scope decision no longer preserves the distribution lock"
contains_fixed "- [ ] User-controlled Bitcoin Core is the only first-release mainnet backend" docs/mainnet-release-checklist.md \
  || fail "the expanded first-mainnet backend evidence is not visibly blocking"
contains_fixed "Tor/onion Core remains excluded" docs/mainnet-release-checklist.md \
  || fail "the first-mainnet Tor exclusion is missing"
contains_fixed "The first production target is a **macOS Apple-silicon desktop release with both software and approved hardware wallets" docs/roadmap.md \
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

echo "Mainnet candidate gate: fixed and multi-network evidence builds enabled; distribution remains blocked."
