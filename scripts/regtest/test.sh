#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_TMP_ROOT="${TMPDIR:-/tmp}"
OWNS_REGTEST_DIR=0
PRIMARY_REGTEST_DIR=""
DESCRIPTOR_REGTEST_DIR=""
if [[ -z "${GROOT_REGTEST_DIR:-}" ]]; then
  export GROOT_REGTEST_DIR
  GROOT_REGTEST_DIR="$(mktemp -d "${TEST_TMP_ROOT%/}/groot-regtest-test.XXXXXX")"
  OWNS_REGTEST_DIR=1
fi
PRIMARY_REGTEST_DIR="${GROOT_REGTEST_DIR}"

if [[ -z "${GROOT_RPC_PORT:-}" || -z "${GROOT_P2P_PORT:-}" ]]; then
  command -v python3 >/dev/null 2>&1 || {
    echo "Missing required command: python3 (set GROOT_RPC_PORT and GROOT_P2P_PORT to bypass automatic port allocation)" >&2
    exit 1
  }
  read -r AVAILABLE_RPC_PORT AVAILABLE_P2P_PORT < <(python3 -c '
import socket
sockets = [socket.socket(), socket.socket()]
for item in sockets:
    item.bind(("127.0.0.1", 0))
print(*(item.getsockname()[1] for item in sockets))
')
  export GROOT_RPC_PORT="${GROOT_RPC_PORT:-${AVAILABLE_RPC_PORT}}"
  export GROOT_P2P_PORT="${GROOT_P2P_PORT:-${AVAILABLE_P2P_PORT}}"
fi

cleanup_owned_dir() {
  local directory="$1"
  if [[ "${directory}" == "${TEST_TMP_ROOT%/}"/groot-regtest-test.* ]]; then
    for _ in {1..20}; do
      rm -rf -- "${directory}" 2>/dev/null || true
      [[ ! -e "${directory}" ]] && break
      sleep 0.1
    done
    if [[ -e "${directory}" ]]; then
      echo "Disposable Regtest directory remained after bounded cleanup." >&2
      return 1
    fi
  fi
}

cleanup() {
  bash "${PROJECT_DIR}/scripts/regtest/stop.sh" >/dev/null 2>&1 || true
  if [[ "${OWNS_REGTEST_DIR}" == 1 ]]; then
    cleanup_owned_dir "${PRIMARY_REGTEST_DIR}"
  fi
  if [[ -n "${DESCRIPTOR_REGTEST_DIR}" ]]; then
    cleanup_owned_dir "${DESCRIPTOR_REGTEST_DIR}"
  fi
}
trap cleanup EXIT
bash "${PROJECT_DIR}/scripts/regtest/start.sh"
GROOT_COMPACT_FILTER_TEST_PEER="127.0.0.1:${GROOT_P2P_PORT}" \
GROOT_COMPACT_FILTER_TEST_RPC_URL="http://127.0.0.1:${GROOT_RPC_PORT}" \
GROOT_COMPACT_FILTER_TEST_COOKIE="${GROOT_REGTEST_DIR}/regtest/.cookie" \
cargo test --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" funded_regtest_reorg_restart_reanchor_and_false_positive_are_consistent --lib -- --ignored --nocapture --test-threads=1
GROOT_RUN_REGTEST=1 cargo test --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" funded_rbf_and_cpfp_cross_groot_proposal_boundaries --lib -- --ignored --nocapture --test-threads=1
GROOT_RUN_REGTEST=1 cargo test --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" clean_storage_descriptor_recovery_restores_known_history_and_survives_reopen --lib -- --ignored --nocapture --test-threads=1
GROOT_RUN_REGTEST=1 cargo test --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" funded_delayed_policy_tracks_each_coin_restarts_and_rearms_after_reorg --lib -- --ignored --nocapture --test-threads=1

# Large rescans and repeated reorgs need a clean resource baseline. Keep the descriptor
# suite independent from state and loaded wallets accumulated by the preceding tests.
bash "${PROJECT_DIR}/scripts/regtest/stop.sh"
DESCRIPTOR_REGTEST_DIR="$(mktemp -d "${TEST_TMP_ROOT%/}/groot-regtest-test.XXXXXX")"
export GROOT_REGTEST_DIR="${DESCRIPTOR_REGTEST_DIR}"
bash "${PROJECT_DIR}/scripts/regtest/start.sh"
GROOT_RUN_REGTEST=1 cargo test --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" --test regtest_multisig -- --ignored --nocapture --test-threads=1
