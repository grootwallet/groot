#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/rust-coverage/common.sh"

coverage_validate_scope
coverage_clean
exec python3 "${COVERAGE_CONFIG_DIR}/full.py"
