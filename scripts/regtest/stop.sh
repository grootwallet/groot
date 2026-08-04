#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command bitcoin-cli
if "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then
  "${BTC_CLI[@]}" stop
  echo "Satchel regtest stopped."
else
  echo "Satchel regtest is not running."
fi
