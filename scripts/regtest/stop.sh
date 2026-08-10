#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command bitcoin-cli
if "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then
  "${BTC_CLI[@]}" stop
  echo "Groot regtest stopped."
else
  echo "Groot regtest is not running."
fi
