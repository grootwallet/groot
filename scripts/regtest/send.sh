#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command bitcoin-cli
require_running
if [[ "${1:-}" == "--" ]]; then shift; fi

if [[ $# -lt 2 ]]; then
  echo "Usage: pnpm regtest:send -- <bcrt1-address> <btc-amount> [--mine]" >&2
  exit 1
fi

ADDRESS="$1"
AMOUNT="$2"
MINE_AFTER="${3:-}"
TXID="$("${WALLET_CLI[@]}" sendtoaddress "${ADDRESS}" "${AMOUNT}")"
echo "Broadcast regtest transaction: ${TXID}"

if [[ "${MINE_AFTER}" == "--mine" ]]; then
  MINING_ADDRESS="$("${WALLET_CLI[@]}" getnewaddress "confirm payment" bech32)"
  "${BTC_CLI[@]}" generatetoaddress 1 "${MINING_ADDRESS}" >/dev/null
  echo "Mined 1 confirmation."
fi
