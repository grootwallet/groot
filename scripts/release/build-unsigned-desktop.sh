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

platform_name="$(uname -s)"
architecture="$(uname -m)"
if [[ "$platform_name" == "Darwin" ]]; then
  for command_name in sw_vers xcodebuild xcrun; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      echo "macOS release evidence requires ${command_name}." >&2
      exit 1
    fi
  done
  macos_product_version="$(sw_vers -productVersion)"
  macos_build_version="$(sw_vers -buildVersion)"
  xcode_version="$(LC_ALL=C xcodebuild -version | sed -n '1s/^Xcode //p')"
  xcode_build="$(LC_ALL=C xcodebuild -version | sed -n '2s/^Build version //p')"
  apple_clang_version="$(LC_ALL=C xcrun clang --version | sed -n '1s/^Apple clang version //p')"
  apple_clang_target="$(LC_ALL=C xcrun clang --version | sed -n 's/^Target: //p')"
  sdk_version="$(xcrun --sdk macosx --show-sdk-version)"
else
  macos_product_version="unavailable"
  macos_build_version="unavailable"
  xcode_version="unavailable"
  xcode_build="unavailable"
  apple_clang_version="unavailable"
  apple_clang_target="unavailable"
  sdk_version="unavailable"
fi

release_commit="$(git rev-parse HEAD)"
export SOURCE_DATE_EPOCH="$(git show -s --format=%ct "$release_commit")"
export GROOT_BUILD_NETWORK=regtest
release_out="${GROOT_RELEASE_OUT:-$repo_root/release-artifacts/$release_commit}"
if [[ -e "$release_out" ]]; then
  echo "Release output already exists: $release_out" >&2
  exit 1
fi

mkdir -p "$release_out"
pnpm install --frozen-lockfile
pnpm validate
cargo build --locked --release --manifest-path src-tauri/Cargo.toml
pnpm tauri build --no-bundle

install -m 0755 src-tauri/target/release/Groot "$release_out/Groot"
node scripts/release/generate-sbom.mjs "$release_out/groot.cdx.json" "$release_out/Groot"
(
  cd "$release_out"
  shasum -a 256 Groot groot.cdx.json > SHA256SUMS
)
{
  echo "commit=$release_commit"
  echo "source_date_epoch=$SOURCE_DATE_EPOCH"
  echo "compiled_network=$GROOT_BUILD_NETWORK"
  echo "rustc=$(rustc --version)"
  echo "cargo=$(cargo --version)"
  echo "target=$(rustc -vV | sed -n 's/^host: //p')"
  echo "node=$(node --version)"
  echo "pnpm=$(pnpm --version)"
  echo "tauri=$(pnpm exec tauri --version)"
  echo "platform=$platform_name"
  echo "macos_product_version=$macos_product_version"
  echo "macos_build_version=$macos_build_version"
  echo "architecture=$architecture"
  echo "xcode_version=$xcode_version"
  echo "xcode_build=$xcode_build"
  echo "apple_clang_version=$apple_clang_version"
  echo "apple_clang_target=$apple_clang_target"
  echo "sdk=macOS $sdk_version"
  echo "cargo_lock_sha256=$(shasum -a 256 src-tauri/Cargo.lock | awk '{print $1}')"
  echo "pnpm_lock_sha256=$(shasum -a 256 pnpm-lock.yaml | awk '{print $1}')"
} > "$release_out/BUILD-INFO"

echo "Unsigned release evidence: $release_out"
