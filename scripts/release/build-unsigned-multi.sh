#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$repo_root"

# shellcheck source=scripts/release/reproducible-rust-env.sh
source "$repo_root/scripts/release/reproducible-rust-env.sh"

fail() {
  echo "Multi-network evidence build failed: $1" >&2
  exit 1
}

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  fail "a clean tracked and untracked worktree is required"
fi
[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] \
  || fail "macOS Apple silicon is required"
[[ "${GROOT_MACOS_SIGNING_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]] \
  || fail "set the reviewed 10-character Developer ID team"
[[ "${GROOT_SIGNED_HWI:-}" = /* && "${GROOT_SIGNED_HWI_MANIFEST:-}" = /* ]] \
  || fail "set absolute GROOT_SIGNED_HWI and GROOT_SIGNED_HWI_MANIFEST paths"
for command_name in codesign sw_vers xcodebuild xcrun; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing ${command_name}"
done

node scripts/release/verify-signed-hwi.mjs \
  "$GROOT_SIGNED_HWI" "$GROOT_SIGNED_HWI_MANIFEST" "$GROOT_MACOS_SIGNING_TEAM_ID"
signed_hwi_sha256="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.artifact.sha256)' "$GROOT_SIGNED_HWI_MANIFEST")"

release_commit="$(git rev-parse HEAD)"
export SOURCE_DATE_EPOCH="$(git show -s --format=%ct "$release_commit")"
export GROOT_BUILD_COMMIT="$release_commit"
export GROOT_BUILD_NETWORK=multi
export GROOT_BUNDLED_HWI_RESOURCE=hwi
export GROOT_HWI_SHA256="$signed_hwi_sha256"
release_out="${GROOT_RELEASE_OUT:-$repo_root/release-artifacts/$release_commit/multi-unsigned}"
[[ ! -e "$release_out" ]] || fail "release output already exists: $release_out"

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
    fail "executable contains an unremapped host path"
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
  echo "compiled_network=multi"
  echo "bundle_identifier=app.groot.wallet"
  echo "signing_team_id=$GROOT_MACOS_SIGNING_TEAM_ID"
  echo "hwi_sha256=$signed_hwi_sha256"
  echo "signed_hwi_manifest_sha256=$(shasum -a 256 "$GROOT_SIGNED_HWI_MANIFEST" | awk '{print $1}')"
  echo "hwi_upstream_sha256=$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.upstream.sha256)' "$GROOT_SIGNED_HWI_MANIFEST")"
  echo "rustc=$(rustc --version)"
  echo "cargo=$(cargo --version)"
  echo "target=$(rustc -vV | sed -n 's/^host: //p')"
  echo "node=$(node --version)"
  echo "pnpm=$(pnpm --version)"
  echo "tauri=$(pnpm exec tauri --version)"
  echo "macos_product_version=$(sw_vers -productVersion)"
  echo "macos_build_version=$(sw_vers -buildVersion)"
  echo "architecture=$(uname -m)"
  echo "xcode_version=$(LC_ALL=C xcodebuild -version | sed -n '1s/^Xcode //p')"
  echo "xcode_build=$(LC_ALL=C xcodebuild -version | sed -n '2s/^Build version //p')"
  echo "apple_clang_version=$(LC_ALL=C xcrun clang --version | sed -n '1s/^Apple clang version //p')"
  echo "apple_clang_target=$(LC_ALL=C xcrun clang --version | sed -n 's/^Target: //p')"
  echo "sdk=macOS $(xcrun --sdk macosx --show-sdk-version)"
  echo "cargo_lock_sha256=$(shasum -a 256 src-tauri/Cargo.lock | awk '{print $1}')"
  echo "pnpm_lock_sha256=$(shasum -a 256 pnpm-lock.yaml | awk '{print $1}')"
  echo "multi_config_sha256=$(shasum -a 256 src-tauri/tauri.multi.conf.json | awk '{print $1}')"
} > "$release_out/BUILD-INFO"

echo "Unsigned multi-network evidence: $release_out"
