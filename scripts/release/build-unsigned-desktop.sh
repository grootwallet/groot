#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Release builds require a clean tracked worktree." >&2
  exit 1
fi
if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Release builds require no untracked files." >&2
  exit 1
fi

release_commit="$(git rev-parse HEAD)"
export SOURCE_DATE_EPOCH="$(git show -s --format=%ct "$release_commit")"
release_out="${SATCHEL_RELEASE_OUT:-$repo_root/release-artifacts/$release_commit}"
if [[ -e "$release_out" ]]; then
  echo "Release output already exists: $release_out" >&2
  exit 1
fi

mkdir -p "$release_out"
pnpm install --frozen-lockfile
pnpm validate
cargo build --locked --release --manifest-path src-tauri/Cargo.toml
pnpm tauri build --no-bundle

install -m 0755 src-tauri/target/release/groot "$release_out/groot"
shasum -a 256 "$release_out/groot" > "$release_out/SHA256SUMS"
{
  echo "commit=$release_commit"
  echo "source_date_epoch=$SOURCE_DATE_EPOCH"
  echo "rustc=$(rustc --version)"
  echo "cargo=$(cargo --version)"
  echo "target=$(rustc -vV | sed -n 's/^host: //p')"
  echo "node=$(node --version)"
  echo "pnpm=$(pnpm --version)"
  echo "os=$(uname -srvmp)"
  echo "cargo_lock_sha256=$(shasum -a 256 src-tauri/Cargo.lock | awk '{print $1}')"
  echo "pnpm_lock_sha256=$(shasum -a 256 pnpm-lock.yaml | awk '{print $1}')"
} > "$release_out/BUILD-INFO"

echo "Unsigned release evidence: $release_out"
