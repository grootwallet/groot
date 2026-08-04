#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGTEST_DIR="${SATCHEL_REGTEST_DIR:-${PROJECT_ROOT}/.regtest}"
REGTEST_WALLET="${SATCHEL_REGTEST_WALLET:-satchel-dev}"
RPC_PORT="${SATCHEL_RPC_PORT:-18443}"
P2P_PORT="${SATCHEL_P2P_PORT:-18444}"
BTC_CLI=(bitcoin-cli -regtest -datadir="${REGTEST_DIR}" -rpcport="${RPC_PORT}")
WALLET_CLI=(bitcoin-cli -regtest -datadir="${REGTEST_DIR}" -rpcport="${RPC_PORT}" -rpcwallet="${REGTEST_WALLET}")

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    echo "On macOS: brew install bitcoin" >&2
    exit 1
  fi
}

require_running() {
  if ! "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then
    echo "Regtest is not running. Start it with: pnpm regtest:start" >&2
    exit 1
  fi
}
