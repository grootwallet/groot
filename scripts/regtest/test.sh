#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_TMP_ROOT="${TMPDIR:-/tmp}"
suite="${1:-all}"
case "${suite}" in
  all|primary|descriptor|continuity) ;;
  *) echo "Unknown Regtest suite: ${suite}" >&2; exit 1 ;;
esac
coverage_lib="${GROOT_RUST_COVERAGE_LIB:-}"
coverage_descriptor="${GROOT_RUST_COVERAGE_DESCRIPTOR:-}"
if [[ -n "${coverage_lib}${coverage_descriptor}" ]]; then
  if [[ ! -x "${coverage_lib}" || ! -x "${coverage_descriptor}" ]]; then
    echo "Both instrumented Regtest executables are required." >&2
    exit 1
  fi
elif [[ "${suite}" != all ]]; then
  echo "Individual Regtest suites require the instrumented executables." >&2
  exit 1
fi
OWNS_REGTEST_DIR=0
ACTIVE_FIXTURE=0
REGTEST_OWNED_PID=""
PRIMARY_REGTEST_DIR=""
DESCRIPTOR_REGTEST_DIR=""
CONTINUITY_REGTEST_DIR=""
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

start_fixture() {
  ACTIVE_FIXTURE=1
  if [[ -z "${coverage_lib}" ]]; then
    bash "${PROJECT_DIR}/scripts/regtest/start.sh" "$@"
    return
  fi
  source "${PROJECT_DIR}/scripts/regtest/start.sh"
  local startup_signal=0
  # Record a pending signal before launch. Cleanup needs the child PID even
  # if cancellation lands between spawning Core and assigning $!.
  trap 'startup_signal=143' TERM
  trap 'startup_signal=130' INT
  start_regtest_node foreground "$@"
  trap 'exit 143' TERM
  trap 'exit 130' INT
  if [[ "${startup_signal}" != 0 ]]; then exit "${startup_signal}"; fi
}

stop_fixture() {
  if [[ "${ACTIVE_FIXTURE}" == 1 ]]; then
    if [[ -n "${coverage_lib}" ]]; then
      stop_regtest_child || return
    else
      bash "${PROJECT_DIR}/scripts/regtest/stop.sh" || return
    fi
    ACTIVE_FIXTURE=0
  fi
}

cleanup() {
  local status="$1"
  trap - EXIT
  # Do not remove a Core datadir if the owned process failed to shut down.
  if ! stop_fixture >/dev/null; then
    echo "Could not stop the Regtest fixture. Its data was retained." >&2
    exit 1
  fi
  if [[ "${OWNS_REGTEST_DIR}" == 1 ]]; then
    cleanup_owned_dir "${PRIMARY_REGTEST_DIR}"
  fi
  if [[ -n "${DESCRIPTOR_REGTEST_DIR}" ]]; then
    cleanup_owned_dir "${DESCRIPTOR_REGTEST_DIR}"
  fi
  if [[ -n "${CONTINUITY_REGTEST_DIR}" ]]; then
    cleanup_owned_dir "${CONTINUITY_REGTEST_DIR}"
  fi
  exit "${status}"
}
trap 'cleanup "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

run_coverage_test() {
  local binary="$1"
  local expected_passes="$2"
  local output status=0
  shift 2
  output=$(cd "${PROJECT_DIR}/src-tauri" &&
    "${binary}" "$@" --ignored --nocapture --test-threads=1 2>&1) || status=$?
  printf '%s\n' "${output}"
  if [[ "${status}" != 0 ]]; then return "${status}"; fi
  # libtest succeeds with zero matches, so verify how many named tests ran.
  if [[ "$(printf '%s\n' "${output}" | grep -Ec "^test result: ok\. ${expected_passes} passed; 0 failed; 0 ignored;")" != 1 ]]; then
    echo "Instrumented Regtest executable did not run the expected ${expected_passes} test(s)." >&2
    return 1
  fi
}

run_lib_test() {
  local test_name="$1"
  if [[ -n "${coverage_lib}" ]]; then
    run_coverage_test "${coverage_lib}" 1 "${test_name}" --exact
  else
    case "${test_name}" in
      *::funded_continuity_all_named_paths_renew_reorg_and_restore|*::funded_continuity_descriptors_restore_history_in_core)
        # Keep assertions, overflow/debug checks and real Core validation.
        cargo test --config profile.test.package.miniscript.opt-level=3 \
          --config profile.test.package.groot.opt-level=3 \
          --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" \
          "${test_name}" --lib -- --ignored --exact --nocapture --test-threads=1
        ;;
      *)
        cargo test --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" \
          "${test_name}" --lib -- --ignored --exact --nocapture --test-threads=1
        ;;
    esac
  fi
}

run_primary() {
  start_fixture
  GROOT_COMPACT_FILTER_TEST_PEER="127.0.0.1:${GROOT_P2P_PORT}" \
  GROOT_COMPACT_FILTER_TEST_RPC_URL="http://127.0.0.1:${GROOT_RPC_PORT}" \
  GROOT_COMPACT_FILTER_TEST_COOKIE="${GROOT_REGTEST_DIR}/regtest/.cookie" \
  run_lib_test compact_filters::tests::funded_regtest_reorg_restart_reanchor_and_false_positive_are_consistent
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::funded_rbf_and_cpfp_cross_groot_proposal_boundaries
  GROOT_RUN_REGTEST=1 run_lib_test wallet::coordination_commands::tests::funded_mobile_cosigner_round_trip_reviews_merges_finalizes_and_broadcasts
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::clean_storage_descriptor_recovery_restores_known_history_and_survives_reopen
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::current_tip_initial_scan_allows_later_bitcoin_core_sync
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::explicit_rescan_waits_when_core_falls_behind_the_wallet_checkpoint
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::birthday_only_checkpoint_recovers_after_a_deep_reorg
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::existing_wallet_can_repeat_full_rescan_from_an_earlier_birthday
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::funded_delayed_policy_tracks_each_coin_restarts_and_rearms_after_reorg
}

run_descriptors() {
  start_fixture
  if [[ -n "${coverage_descriptor}" ]]; then
    GROOT_RUN_REGTEST=1 run_coverage_test "${coverage_descriptor}" 4
  else
    GROOT_RUN_REGTEST=1 cargo test --locked --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" \
      --test regtest_multisig -- --ignored --nocapture --test-threads=1
  fi
}

run_continuity() {
  start_fixture --long-continuity
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::funded_continuity_all_named_paths_renew_reorg_and_restore
  GROOT_RUN_REGTEST=1 run_lib_test wallet::funded_acceleration_tests::funded_continuity_descriptors_restore_history_in_core
}

case "${suite}" in
  primary) run_primary ;;
  descriptor) run_descriptors ;;
  continuity) run_continuity ;;
  all)
    run_primary
    stop_fixture
    if [[ -z "${coverage_lib}" ]]; then
      # Release stale Groot artifacts before building the independent descriptor suite.
      cargo clean --manifest-path "${PROJECT_DIR}/src-tauri/Cargo.toml" --package groot
    fi
    DESCRIPTOR_REGTEST_DIR="$(mktemp -d "${TEST_TMP_ROOT%/}/groot-regtest-test.XXXXXX")"
    export GROOT_REGTEST_DIR="${DESCRIPTOR_REGTEST_DIR}"
    run_descriptors
    stop_fixture
    CONTINUITY_REGTEST_DIR="$(mktemp -d "${TEST_TMP_ROOT%/}/groot-regtest-test.XXXXXX")"
    export GROOT_REGTEST_DIR="${CONTINUITY_REGTEST_DIR}"
    run_continuity
    ;;
esac
