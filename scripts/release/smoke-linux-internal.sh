#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Linux || "$#" != 1 || "$(id -u)" == 0 ]]; then
  echo 'Use an unprivileged account on a clean Linux test runner and pass the package directory.' >&2
  exit 1
fi
: "${GROOT_INTERNAL_CANDIDATE_COMMIT:?Provide the exact approved candidate commit.}"
[[ "$GROOT_INTERNAL_CANDIDATE_COMMIT" =~ ^[0-9a-f]{40}$ ]]
package_dir="$(cd "$1" && pwd -P)"
cd "$package_dir"
grep -Fxq "commit=$GROOT_INTERNAL_CANDIDATE_COMMIT" BUILD-INFO
grep -Fxq 'compiled_network=testnet4' BUILD-INFO
grep -Fxq 'platform=linux-x86_64' BUILD-INFO
sha256sum --check --strict --quiet SHA256SUMS

shopt -s nullglob
installers=("$package_dir"/*.deb)
if [[ "${#installers[@]}" != 1 || -e /usr/bin/Groot ]]; then
  echo 'Expected one DEB and no existing Groot installation on the test runner.' >&2
  exit 1
fi
sudo apt-get install -y --no-install-recommends -- "${installers[0]}"

smoke_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/groot-linux-smoke.XXXXXX")"
trap 'rm -rf -- "$smoke_dir"' EXIT
# The DEB bundler can strip the binary after the build digest is recorded.
dpkg-deb -x "${installers[0]}" "$smoke_dir/payload"
if ! cmp -s "$smoke_dir/payload/usr/bin/Groot" /usr/bin/Groot; then
  echo 'Installed Groot differs from the verified DEB payload.' >&2
  exit 1
fi
mkdir -m 700 "$smoke_dir/runtime"
export XDG_DATA_HOME="$smoke_dir/data"
export XDG_CONFIG_HOME="$smoke_dir/config"
export XDG_CACHE_HOME="$smoke_dir/cache"
export XDG_RUNTIME_DIR="$smoke_dir/runtime"
export GDK_BACKEND=x11

dbus-run-session -- xvfb-run -a bash -s -- "$smoke_dir" "$GROOT_INTERNAL_CANDIDATE_COMMIT" <<'SMOKE'
set -euo pipefail
/usr/bin/Groot >"$1/app.log" 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true' EXIT
for _ in {1..40}; do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    echo 'Installed Groot exited during startup.' >&2
    exit 1
  fi
  if xdotool search --onlyvisible --all --pid "$app_pid" --name '^Groot' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
sleep 10
kill -0 "$app_pid" 2>/dev/null
xdotool search --onlyvisible --all --pid "$app_pid" --name '^Groot' >/dev/null
python3 - "$2" "$XDG_DATA_HOME/app.groot.wallet.testnet4.internal54/diagnostics-v1.jsonl" <<'PY'
import json
import sys
from pathlib import Path

with Path(sys.argv[2]).open() as records:
    for line in records:
        record = json.loads(line)
        if (record.get("event"), record.get("outcome"), record.get("compiledNetwork"),
                record.get("buildCommit")) == ("app_started", "succeeded", "testnet4", sys.argv[1]):
            print("Installed Groot opened a window and recorded a successful Testnet4 startup.")
            break
    else:
        raise SystemExit("No successful startup event for the exact Testnet4 candidate.")
PY
SMOKE
