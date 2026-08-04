#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
export SATCHEL_REGTEST_DIR="${PROJECT_DIR}/.regtest-test"
export SATCHEL_RPC_PORT=28443
export SATCHEL_P2P_PORT=28444
trap 'bash "${PROJECT_DIR}/scripts/regtest/stop.sh" >/dev/null 2>&1 || true' EXIT
bash "${PROJECT_DIR}/scripts/regtest/start.sh"
SATCHEL_RUN_REGTEST=1 cargo test --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" --test regtest_multisig -- --nocapture
