#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command bitcoin-cli
require_running
if [[ "${1:-}" == "--" ]]; then shift; fi
BLOCKS="${1:-1}"
if ! [[ "${BLOCKS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Block count must be a positive integer." >&2
  exit 1
fi

MINING_ADDRESS="$("${WALLET_CLI[@]}" getnewaddress "regtest mining" bech32)"
"${BTC_CLI[@]}" generatetoaddress "${BLOCKS}" "${MINING_ADDRESS}"
echo "Mined ${BLOCKS} block(s)."
