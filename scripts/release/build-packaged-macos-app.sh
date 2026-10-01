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

exec pnpm exec tauri build \
  --config src-tauri/tauri.multi.conf.json \
  --bundles app
