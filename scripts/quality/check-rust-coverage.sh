#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/rust-coverage/common.sh"

coverage_validate_scope
coverage_clean
cd "${COVERAGE_CONFIG_DIR}"
cargo llvm-cov --no-report --locked --manifest-path "${MANIFEST_PATH}" --profile coverage --lib
coverage_report_core
