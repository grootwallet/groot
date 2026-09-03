#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$repo_root"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Mainnet evidence builds require a clean tracked worktree." >&2
  exit 1
fi
if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Mainnet evidence builds require no untracked files." >&2
  exit 1
fi
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "The first mainnet candidate is restricted to macOS Apple silicon." >&2
  exit 1
fi
if [[ ! "${GROOT_MACOS_SIGNING_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "Set GROOT_MACOS_SIGNING_TEAM_ID to the reviewed 10-character Developer ID team." >&2
  exit 1
fi

release_commit="$(git rev-parse HEAD)"
export SOURCE_DATE_EPOCH="$(git show -s --format=%ct "$release_commit")"
export GROOT_BUILD_COMMIT="$release_commit"
export GROOT_BUILD_NETWORK=mainnet
export GROOT_BUNDLED_HWI_RESOURCE=hwi
export GROOT_HWI_SHA256
GROOT_HWI_SHA256="$(node -e 'const m=require("./docs/hwi-artifact-manifest-3.2.0-mac-arm64.json"); process.stdout.write(m.artifact.sha256)')"
release_out="${GROOT_RELEASE_OUT:-$repo_root/release-artifacts/$release_commit/mainnet-unsigned}"
if [[ -e "$release_out" ]]; then
  echo "Release output already exists: $release_out" >&2
  exit 1
fi

cargo_target="$(cargo metadata --format-version 1 --no-deps --manifest-path src-tauri/Cargo.toml | node -e 'let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(value).target_directory));')"

mkdir -p "$release_out"
pnpm install --frozen-lockfile
pnpm validate
cargo build --locked --release --manifest-path src-tauri/Cargo.toml

install -m 0755 "$cargo_target/release/Groot" "$release_out/Groot"
node scripts/release/generate-sbom.mjs "$release_out/groot.cdx.json" "$release_out/Groot"
(
  cd "$release_out"
  shasum -a 256 Groot groot.cdx.json > SHA256SUMS
)
{
  echo "commit=$release_commit"
  echo "source_date_epoch=$SOURCE_DATE_EPOCH"
  echo "compiled_network=$GROOT_BUILD_NETWORK"
  echo "bundle_identifier=app.groot.wallet.mainnet"
  echo "signing_team_id=$GROOT_MACOS_SIGNING_TEAM_ID"
  echo "hwi_sha256=$GROOT_HWI_SHA256"
  echo "rustc=$(rustc --version)"
  echo "cargo=$(cargo --version)"
  echo "target=$(rustc -vV | sed -n 's/^host: //p')"
  echo "node=$(node --version)"
  echo "pnpm=$(pnpm --version)"
  echo "tauri=$(pnpm exec tauri --version)"
  echo "os=$(uname -srvmp)"
  echo "sdk=macOS $(xcrun --sdk macosx --show-sdk-version)"
  echo "cargo_lock_sha256=$(shasum -a 256 src-tauri/Cargo.lock | awk '{print $1}')"
  echo "pnpm_lock_sha256=$(shasum -a 256 pnpm-lock.yaml | awk '{print $1}')"
  echo "mainnet_config_sha256=$(shasum -a 256 src-tauri/tauri.mainnet.conf.json | awk '{print $1}')"
} > "$release_out/BUILD-INFO"

echo "Unsigned mainnet evidence: $release_out"
