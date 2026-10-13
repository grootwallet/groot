#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$repo_root"

# shellcheck source=scripts/release/reproducible-rust-env.sh
source "$repo_root/scripts/release/reproducible-rust-env.sh"

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
for command_name in codesign sw_vers xcodebuild xcrun; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Mainnet evidence builds require ${command_name}." >&2
    exit 1
  fi
done

macos_product_version="$(sw_vers -productVersion)"
macos_build_version="$(sw_vers -buildVersion)"
architecture="$(uname -m)"
xcode_version="$(LC_ALL=C xcodebuild -version | sed -n '1s/^Xcode //p')"
xcode_build="$(LC_ALL=C xcodebuild -version | sed -n '2s/^Build version //p')"
apple_clang_version="$(LC_ALL=C xcrun clang --version | sed -n '1s/^Apple clang version //p')"
apple_clang_target="$(LC_ALL=C xcrun clang --version | sed -n 's/^Target: //p')"
sdk_version="$(xcrun --sdk macosx --show-sdk-version)"
for value in \
  "$macos_product_version" \
  "$macos_build_version" \
  "$architecture" \
  "$xcode_version" \
  "$xcode_build" \
  "$apple_clang_version" \
  "$apple_clang_target" \
  "$sdk_version"; do
  if [[ -z "$value" ]]; then
    echo "Mainnet evidence build environment metadata is incomplete." >&2
    exit 1
  fi
done

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
mkdir -p "$cargo_target"
configure_reproducible_rust_env "$repo_root" "$cargo_target"

mkdir -p "$release_out"
pnpm install --frozen-lockfile
pnpm validate
cargo build --locked --release --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol

built_executable="$cargo_target/release/Groot"
codesign --verify --strict "$built_executable"
node scripts/release/normalize-macho-uuid.mjs "$built_executable"
codesign --verify --strict "$built_executable"
effective_cargo_home="${CARGO_HOME:-$HOME/.cargo}"
effective_cargo_home="$(cd "$effective_cargo_home" && pwd -P)"
physical_home="$(cd "$HOME" && pwd -P)"
for forbidden_path in "$repo_root" "$effective_cargo_home" "$cargo_target" "$physical_home"; do
  if strings "$built_executable" | awk -v needle="$forbidden_path" \
    'index($0, needle) { found = 1 } END { exit !found }'; then
    echo "Mainnet evidence executable contains an unremapped host path." >&2
    exit 1
  fi
done

install -m 0755 "$built_executable" "$release_out/Groot"
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
  echo "mainnet_config_sha256=$(shasum -a 256 src-tauri/tauri.mainnet.conf.json | awk '{print $1}')"
} > "$release_out/BUILD-INFO"

echo "Unsigned mainnet evidence: $release_out"
