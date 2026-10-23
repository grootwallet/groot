#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
case "${1:-}" in psbt_roundtrip|ur_composition|pairing_records) target="$1";; *) echo 'Choose psbt_roundtrip, ur_composition or pairing_records.' >&2; exit 2;; esac
shift
export RUSTUP_TOOLCHAIN=nightly-2026-10-22
if [[ "$(cargo-fuzz --version)" != 'cargo-fuzz 0.13.2' ]]; then
  echo 'Install the reviewed cargo-fuzz 0.13.2 with --locked.' >&2; exit 2
fi
export PATH="$PWD/fuzz/tools:$PATH"
# Upstream cfg(fuzzing) changes dependencies and currently breaks nusb 0.2.7.
# Exercise normal production branches; sanitizer coverage remains enabled.
# Apple's newer linker rejects ASan initializer sections in this Tauri graph.
# The Xcode-provided classic linker retains the same sanitizer instrumentation.
if [[ "$(uname -s)" == Darwin ]]; then
  xcrun --find ld-classic >/dev/null
  export RUSTFLAGS="${RUSTFLAGS:-} -Clink-arg=-Wl,-ld_classic"
fi
exec cargo-fuzz run "$target" --fuzz-dir fuzz --no-cfg-fuzzing --release \
  --target-dir "${GROOT_FUZZ_TARGET_DIR:-$PWD/fuzz/target}" -- "$@"
