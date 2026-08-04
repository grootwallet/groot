#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command bitcoin-cli
require_running
echo "Blockchain:"
"${BTC_CLI[@]}" getblockchaininfo
echo "Wallet:"
"${WALLET_CLI[@]}" getbalances
