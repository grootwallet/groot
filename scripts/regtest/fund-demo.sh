#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

if [[ "${1:-}" == "--" ]]; then shift; fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <single-key-bcrt1-address> <vault-bcrt1-address> [more-bcrt1-addresses...]" >&2
  echo "The first address receives two payments to exercise the address-reuse privacy insight." >&2
  exit 2
fi

require_command bitcoin-cli
require_command jq
require_running

for address in "$@"; do
  valid="$("${BTC_CLI[@]}" validateaddress "$address" | jq -r '.isvalid')"
  if [[ "$valid" != "true" || "$address" != bcrt1* ]]; then
    echo "Refusing non-regtest or invalid address: $address" >&2
    exit 2
  fi
done

reused_address="$1"
"${WALLET_CLI[@]}" sendtoaddress "$reused_address" 0.003 >/dev/null
"${WALLET_CLI[@]}" sendtoaddress "$reused_address" 0.0015 >/dev/null
shift

for address in "$@"; do
  "${WALLET_CLI[@]}" sendtoaddress "$address" 0.004 >/dev/null
done

mining_address="$("${WALLET_CLI[@]}" getnewaddress "demo funding" bech32)"
"${BTC_CLI[@]}" generatetoaddress 1 "$mining_address" >/dev/null
echo "Confirmed two payments to the first address and one payment to each remaining address."
