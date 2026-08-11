#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == "Darwin" ]] || {
  echo "The packaged lifecycle test requires macOS." >&2
  exit 1
}
[[ $# -eq 1 ]] || {
  echo "Usage: $0 /absolute/path/to/Groot.app" >&2
  exit 2
}

app_bundle="$1"
[[ "$app_bundle" = /* && -d "$app_bundle" && ! -L "$app_bundle" ]] || {
  echo "Provide an absolute, regular .app bundle path." >&2
  exit 2
}
binary="$app_bundle/Contents/MacOS/Groot"
[[ -f "$binary" && -x "$binary" && ! -L "$binary" ]] || {
  echo "The Groot executable is missing, non-executable, or a symlink." >&2
  exit 2
}

profile="$(mktemp -d /tmp/groot-regtest-packaged-lifecycle.XXXXXX)"
first_log="$profile/first.log"
second_log="$profile/second.log"
restart_log="$profile/restart.log"
first_pid=""
second_pid=""
restart_pid=""

cleanup() {
  for pid in "$restart_pid" "$second_pid" "$first_pid"; do
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  if [[ "$profile" == /tmp/groot-regtest-packaged-lifecycle.* && -d "$profile" && ! -L "$profile" ]]; then
    rm -rf -- "$profile"
  fi
}
trap cleanup EXIT INT TERM

wait_for_lock() {
  local pid="$1"
  for _ in $(seq 1 200); do
    [[ -f "$profile/.groot-process.lock" ]] && kill -0 "$pid" 2>/dev/null && return 0
    sleep 0.05
  done
  return 1
}

GROOT_REGTEST_APP_DATA_DIR="$profile" "$binary" >"$first_log" 2>&1 &
first_pid="$!"
wait_for_lock "$first_pid" || {
  echo "The first packaged process did not acquire its isolated lock." >&2
  exit 1
}

GROOT_REGTEST_APP_DATA_DIR="$profile" "$binary" >"$second_log" 2>&1 &
second_pid="$!"
second_status=""
for _ in $(seq 1 100); do
  if ! kill -0 "$second_pid" 2>/dev/null; then
    set +e
    wait "$second_pid"
    second_status="$?"
    set -e
    second_pid=""
    break
  fi
  sleep 0.05
done
if [[ -z "$second_status" ]]; then
  echo "A second packaged process remained alive instead of failing closed." >&2
  exit 1
fi
[[ "$second_status" -ne 0 ]] || {
  echo "A second packaged process unexpectedly opened the same profile." >&2
  exit 1
}
grep -Eiq "already (open|running)|another Groot process" "$second_log" || {
  echo "The second-launch failure was not understandable." >&2
  exit 1
}

kill -KILL "$first_pid"
wait "$first_pid" 2>/dev/null || true
first_pid=""

GROOT_REGTEST_APP_DATA_DIR="$profile" "$binary" >"$restart_log" 2>&1 &
restart_pid="$!"
wait_for_lock "$restart_pid" || {
  echo "The packaged app did not recover its lock after forced termination." >&2
  exit 1
}

echo "Packaged macOS process exclusion and forced-termination recovery passed."
