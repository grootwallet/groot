#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$repo_root"

# shellcheck source=scripts/release/reproducible-rust-env.sh
source "$repo_root/scripts/release/reproducible-rust-env.sh"

if [[ $# -ne 1 || "$1" != /* || ! -d "$1" ]]; then
  echo "usage: $0 /absolute/existing/cargo-target" >&2
  exit 2
fi

cargo_target="$(cd "$1" && pwd -P)"
configure_reproducible_rust_env "$repo_root" "$cargo_target"

TAURI_ENV_PLATFORM=macos pnpm build:multi
node scripts/release/verify-native-frontend-output.mjs build
cargo build \
  --locked \
  --release \
  --manifest-path src-tauri/Cargo.toml \
  --features tauri/custom-protocol

built_executable="$cargo_target/release/Groot"
codesign --verify --strict "$built_executable"
node scripts/release/normalize-macho-uuid.mjs "$built_executable"
codesign --verify --strict "$built_executable"

exec pnpm exec tauri bundle \
  --config src-tauri/tauri.multi.conf.json \
  --bundles app \
  --no-sign
