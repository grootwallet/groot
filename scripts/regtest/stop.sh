#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command bitcoin-cli
if "${BTC_CLI[@]}" getblockchaininfo >/dev/null 2>&1; then
  BITCOIND_PID=""
  if [[ -r "${REGTEST_DIR}/regtest/bitcoind.pid" ]]; then
    read -r BITCOIND_PID < "${REGTEST_DIR}/regtest/bitcoind.pid"
  fi
  "${BTC_CLI[@]}" stop
  if [[ "${BITCOIND_PID}" =~ ^[0-9]+$ ]]; then
    for _ in {1..100}; do
      if ! kill -0 "${BITCOIND_PID}" >/dev/null 2>&1; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "${BITCOIND_PID}" >/dev/null 2>&1; then
      echo "Bitcoin Core did not stop within the bounded shutdown wait." >&2
      exit 1
    fi
  fi
  echo "Groot regtest stopped."
else
  echo "Groot regtest is not running."
fi
