#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"

for network in regtest signet testnet4; do
  echo "Checking trusted Rust for ${network}..."
  GROOT_BUILD_NETWORK="$network" cargo check \
    --locked \
    --all-features \
    --manifest-path "$repo_root/src-tauri/Cargo.toml"
done

echo "Non-mainnet native build matrix: regtest, signet, and testnet4 compile."
