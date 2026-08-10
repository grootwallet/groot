#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command bitcoind
require_command bitcoin-cli
mkdir -p "${REGTEST_DIR}"

if "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then
  echo "Groot regtest is already running."
else
  bitcoind \
    -regtest \
    -daemon \
    -datadir="${REGTEST_DIR}" \
    -server=1 \
    -txindex=1 \
    -fallbackfee=0.00001 \
    -rpcbind=127.0.0.1 \
    -rpcallowip=127.0.0.1 \
    -rpcport="${RPC_PORT}" \
    -port="${P2P_PORT}" \
    -nosettings

  for _ in {1..50}; do
    if "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then break; fi
    sleep 0.2
  done
  require_running
fi

if ! "${WALLET_CLI[@]}" getwalletinfo >/dev/null 2>&1; then
  if ! "${BTC_CLI[@]}" loadwallet "${REGTEST_WALLET}" >/dev/null 2>&1; then
    "${BTC_CLI[@]}" -named createwallet wallet_name="${REGTEST_WALLET}" descriptors=true >/dev/null
  fi
fi

if [[ ! -f "${REGTEST_DIR}/.groot-funded" ]]; then
  MINING_ADDRESS="$("${WALLET_CLI[@]}" getnewaddress "initial regtest funds" bech32)"
  "${BTC_CLI[@]}" generatetoaddress 101 "${MINING_ADDRESS}" >/dev/null
  touch "${REGTEST_DIR}/.groot-funded"
  echo "Mined 101 blocks; groot-dev now has spendable regtest coins."
fi

echo "Groot regtest is ready."
echo "RPC: 127.0.0.1:${RPC_PORT}"
echo "P2P: 127.0.0.1:${P2P_PORT}"
"${WALLET_CLI[@]}" getbalances
