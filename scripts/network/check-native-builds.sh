#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"

for network in regtest signet testnet4 mainnet; do
  echo "Checking trusted Rust for ${network}..."
  GROOT_BUILD_NETWORK="$network" cargo check \
    --locked \
    --all-features \
    --manifest-path "$repo_root/src-tauri/Cargo.toml"
done

echo "Native build matrix: regtest, signet, testnet4, and the isolated mainnet candidate compile."
