#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

if [[ "$#" -ne 1 ]]; then
  echo "Usage: bash scripts/dev/tauri-ios-foundation.sh <check|init|build>" >&2
  exit 1
fi
case "$1" in
  check|init|build) ;;
  *) echo "Expected check, init or build. No device was selected." >&2; exit 1 ;;
esac

# Reuse the runtime selector only; do not reuse desktop certification profiles.
bash "${REPOSITORY_ROOT}/scripts/dev/tauri-regtest.sh" --check-runtime
required_node="$(tr -d '[:space:]' < "${REPOSITORY_ROOT}/.node-version")"
if [[ "$(node --version)" != "v${required_node}" ]]; then
  for runtime_root in "${NVM_DIR:-${HOME}/.nvm}" "${HOME}/.nvm"; do
    runtime_bin="${runtime_root}/versions/node/v${required_node}/bin"
    if [[ -x "${runtime_bin}/node" ]]; then
      export PATH="${runtime_bin}:${PATH}"
      break
    fi
  done
fi
[[ "$(node --version)" == "v${required_node}" ]]
[[ "$(pnpm --version)" == "11.13.1" ]]
[[ "$(uname -s)" == "Darwin" ]] || { echo "iOS builds require macOS." >&2; exit 1; }
xcodebuild -version
command -v xcodegen >/dev/null || { echo "XcodeGen is required by the pinned Tauri iOS generator." >&2; exit 1; }
rustup target list --installed | /usr/bin/grep -qx aarch64-apple-ios || {
  echo "Install the pinned Rust toolchain's aarch64-apple-ios target before building." >&2
  exit 1
}

# Fixed test network and an independent Cargo output directory. Never start a
# LAN dev server, inherit a desktop profile, install, or select a phone here.
export GROOT_BUILD_NETWORK=testnet4
export PUBLIC_BITCOIN_NETWORK=testnet4
export CARGO_TARGET_DIR="${REPOSITORY_ROOT}/src-tauri/target/mobile-5.3"
# Tauri's Xcode bridge retains CARGO_* and PATH, but not GROOT_*.
# The small scoped Cargo runner restores the network through Cargo config.
export CARGO_GROOT_IOS_REAL_CARGO="$(command -v cargo)"
export PATH="${REPOSITORY_ROOT}/scripts/dev/ios-cargo:${PATH}"
unset GROOT_REGTEST_APP_DATA_DIR GROOT_MULTI_NETWORK_APP_DATA_DIR GROOT_BUILD_COMMIT
cd "${REPOSITORY_ROOT}"
case "$1" in
  check) echo "iOS foundation prerequisites passed; no device or wallet was accessed." ;;
  init)
    if [[ -d src-tauri/gen/apple ]]; then
      echo "An iOS project already exists. Inspect its identifier and signing settings; it was not overwritten." >&2
      exit 1
    fi
    exec pnpm tauri ios init --ci --skip-targets-install
    ;;
  build)
    [[ -d src-tauri/gen/apple ]] || { echo "Run the init action first." >&2; exit 1; }
    if ! /usr/bin/grep -q 'PRODUCT_BUNDLE_IDENTIFIER: app.groot.wallet.mobile.testnet4.dev' src-tauri/gen/apple/project.yml; then
      echo "Generated Apple project is not the isolated Testnet4 identity. Inspect and regenerate it before building." >&2
      exit 1
    fi
    pnpm tauri ios build --debug --target aarch64 --no-sign --archive-only --ci
    # This is the default-feature build-script output used by the archived
    # library, not the separate all-feature Clippy result.
    node scripts/dev/verify-ios-foundation-build.mjs "${CARGO_TARGET_DIR}"
    ;;
esac
