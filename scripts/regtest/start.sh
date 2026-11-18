#!/usr/bin/env bash
set -euo pipefail

start_regtest_node() {
  local lifecycle="$1"
  shift
  source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

  require_command bitcoind
  require_command bitcoin-cli
  mkdir -p "${REGTEST_DIR}"

  local options=(
    -regtest
    "-datadir=${REGTEST_DIR}"
    -server=1
    -txindex=1
    -blockfilterindex=1
    -peerblockfilters=1
    -fallbackfee=0.00001
    -rpcbind=127.0.0.1
    -rpcallowip=127.0.0.1
    "-rpcport=${RPC_PORT}"
    "-port=${P2P_PORT}"
    -nosettings
  )
  # These fixtures mine over 52,000 real blocks. Sample Core's debug-only
  # block-index traversal while retaining every consensus check.
  if [[ "${1:-}" == "--long-continuity" ]]; then
    options+=(-checkblockindex=128)
  fi

  if "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then
    echo "Groot regtest is already running."
  else
    if [[ "${lifecycle}" == foreground ]]; then
      # Each automated fixture listens only on its reserved P2P port. The
      # default Tor listener may otherwise claim an adjacent fixture's RPC port.
      bitcoind "${options[@]}" "-bind=127.0.0.1:${P2P_PORT}" -listenonion=0 \
        >"${REGTEST_DIR}/groot-core-output.log" 2>&1 &
      REGTEST_OWNED_PID=$!
    else
      bitcoind -daemon "${options[@]}"
    fi

    for _ in {1..50}; do
      if "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then break; fi
      sleep 0.2
    done
    if [[ "${lifecycle}" == foreground ]] && ! "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then
      grep '^Error:' "${REGTEST_DIR}/groot-core-output.log" >&2 || true
    fi
    require_running
  fi

  if ! "${WALLET_CLI[@]}" getwalletinfo >/dev/null 2>&1; then
    if ! "${BTC_CLI[@]}" loadwallet "${REGTEST_WALLET}" >/dev/null 2>&1; then
      "${BTC_CLI[@]}" -named createwallet wallet_name="${REGTEST_WALLET}" descriptors=true >/dev/null
    fi
  fi

  if [[ ! -f "${REGTEST_DIR}/.groot-funded" ]]; then
    local mining_address
    mining_address="$("${WALLET_CLI[@]}" getnewaddress "initial regtest funds" bech32)"
    "${BTC_CLI[@]}" generatetoaddress 101 "${mining_address}" >/dev/null
    touch "${REGTEST_DIR}/.groot-funded"
    echo "Mined 101 blocks; groot-dev now has spendable regtest coins."
  fi

  echo "Groot regtest is ready."
  echo "RPC: 127.0.0.1:${RPC_PORT}"
  echo "P2P: 127.0.0.1:${P2P_PORT}"
  "${WALLET_CLI[@]}" getbalances
}

owned_regtest_child_running() {
  jobs -pr | grep -Fxq -- "${REGTEST_OWNED_PID}"
}

stop_regtest_child() {
  # An already-running caller fixture does not have a child PID.
  if [[ -z "${REGTEST_OWNED_PID:-}" ]]; then return 0; fi
  if owned_regtest_child_running; then
    kill -TERM "${REGTEST_OWNED_PID}" 2>/dev/null || true
  fi
  for _ in {1..100}; do
    if ! owned_regtest_child_running; then break; fi
    sleep 0.1
  done
  if owned_regtest_child_running; then
    echo "The owned Bitcoin Core fixture exceeded its shutdown limit." >&2
    kill -KILL "${REGTEST_OWNED_PID}" 2>/dev/null || true
    wait "${REGTEST_OWNED_PID}" 2>/dev/null || true
    return 1
  fi
  wait "${REGTEST_OWNED_PID}" 2>/dev/null || true
  REGTEST_OWNED_PID=""
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  start_regtest_node daemon "$@"
fi
