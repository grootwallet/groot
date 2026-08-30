#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST_PATH="${PROJECT_DIR}/src-tauri/Cargo.toml"

cd "${PROJECT_DIR}"

# Whole-library coverage includes ordinary deterministic tests and the isolated
# real-Core scenarios that exercise funded sync, reorg, recovery, proposal,
# signing, and broadcast paths. Keep the deterministic-core gate separate so a
# large adapter surface cannot dilute its near-exhaustive policy requirement.
cargo llvm-cov clean --workspace --manifest-path "${MANIFEST_PATH}"
cargo llvm-cov --no-report --locked --manifest-path "${MANIFEST_PATH}" --lib
GROOT_RUST_COVERAGE=1 bash scripts/regtest/test.sh
cargo llvm-cov report \
  --manifest-path "${MANIFEST_PATH}" \
  --summary-only \
  --fail-under-lines 62 \
  --fail-under-functions 59 \
  --fail-under-regions 59
