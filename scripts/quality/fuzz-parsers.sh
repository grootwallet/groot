#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
case "${1:-}" in psbt_roundtrip|ur_composition|pairing_records) target="$1";; *) echo 'Choose psbt_roundtrip, ur_composition or pairing_records.' >&2; exit 2;; esac
shift
export RUSTUP_TOOLCHAIN=nightly-2026-10-22
if [[ "$(cargo-fuzz --version)" != 'cargo-fuzz 0.13.2' ]]; then
  echo 'Install the reviewed cargo-fuzz 0.13.2 with --locked.' >&2; exit 2
fi
# Keep mutable outputs out of directories watched by the application build.
# Do not weaken the release source/clean-checkout guard to speed up fuzzing.
: "${GROOT_FUZZ_TARGET_DIR:?Set an absolute build-cache directory outside the repository}"
case "$GROOT_FUZZ_TARGET_DIR" in /*) ;; *) echo 'Fuzz target directory must be absolute.' >&2; exit 2;; esac
mkdir -p "$GROOT_FUZZ_TARGET_DIR"
cache_root="$(cd "$GROOT_FUZZ_TARGET_DIR" && pwd -P)"
repository_root="$(pwd -P)"
case "$cache_root/" in "$repository_root/"*) echo 'Fuzz build cache must be outside the repository.' >&2; exit 2;; esac
corpus_root="${GROOT_FUZZ_CORPUS_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/groot-fuzz-corpus.XXXXXX")}"
case "$corpus_root" in /*) ;; *) echo 'Fuzz corpus directory must be absolute.' >&2; exit 2;; esac
mkdir -p "$corpus_root"
corpus_root="$(cd "$corpus_root" && pwd -P)"
case "$corpus_root/" in "$repository_root/"*) echo 'Active fuzz corpus must be outside the repository.' >&2; exit 2;; esac
if [[ ! -d "fuzz/corpus/$target" ]]; then
  echo 'Generate the synthetic seed corpus first (see fuzz/README.md).' >&2; exit 2
fi
mkdir -p "$corpus_root/$target"
target_corpus="$(cd "$corpus_root/$target" && pwd -P)"
case "$target_corpus/" in "$repository_root/"*) echo 'Active target corpus must be outside the repository.' >&2; exit 2;; esac
cp -R "fuzz/corpus/$target/." "$target_corpus/"
# cargo-fuzz creates these after its first build; create all before that build
# so an empty output directory does not cause a second full application rebuild.
mkdir -p fuzz/artifacts/psbt_roundtrip fuzz/artifacts/ur_composition fuzz/artifacts/pairing_records
printf 'Active synthetic corpus: %s\n' "$target_corpus" >&2
export PATH="$PWD/fuzz/tools:$PATH"
# Upstream cfg(fuzzing) changes dependencies and currently breaks nusb 0.2.7.
# Exercise normal production branches; sanitizer coverage remains enabled.
# Apple's newer linker rejects ASan initializer sections in this Tauri graph.
# The Xcode-provided classic linker retains the same sanitizer instrumentation.
if [[ "$(uname -s)" == Darwin ]]; then
  xcrun --find ld-classic >/dev/null
  export RUSTFLAGS="${RUSTFLAGS:-} -Clink-arg=-Wl,-ld_classic"
fi
exec cargo-fuzz run "$target" "$target_corpus" --fuzz-dir fuzz --no-cfg-fuzzing --release \
  --target-dir "$cache_root" -- "$@"
