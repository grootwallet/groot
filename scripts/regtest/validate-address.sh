#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

require_command bitcoin-cli
require_running

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: pnpm regtest:validate-address -- <regtest-address>" >&2
  exit 1
fi

"${BTC_CLI[@]}" validateaddress "$1"
