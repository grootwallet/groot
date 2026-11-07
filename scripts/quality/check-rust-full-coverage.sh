#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST_PATH="${PROJECT_DIR}/src-tauri/Cargo.toml"
export CARGO_LLVM_COV_TARGET_DIR="${CARGO_LLVM_COV_TARGET_DIR:-${CARGO_TARGET_DIR:-${PROJECT_DIR}/src-tauri/target}/llvm-cov-target}"

cd "${PROJECT_DIR}"

# Start fresh, run deterministic units once and enforce their core thresholds
# before any funded scenario can add coverage. A failed core gate stops here.
bash scripts/quality/check-rust-coverage.sh
# Append all 15 isolated Core scenarios to that same instrumented workspace.
GROOT_RUST_COVERAGE=1 bash scripts/regtest/test.sh
cargo llvm-cov report \
  --locked \
  --manifest-path "${MANIFEST_PATH}" \
  --summary-only \
  --fail-under-lines 62 \
  --fail-under-functions 59 \
  --fail-under-regions 59
