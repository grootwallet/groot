#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/groot-runtime-launcher.XXXXXX")"
trap 'rm -rf "${TEST_ROOT}"' EXIT

STALE_BIN="${TEST_ROOT}/stale/bin"
PINNED_BIN="${TEST_ROOT}/nvm/versions/node/v24.19.0/bin"
mkdir -p "${STALE_BIN}" "${PINNED_BIN}" "${TEST_ROOT}/home"

printf '#!/usr/bin/env bash\nprintf "v22.22.0\\n"\n' > "${STALE_BIN}/node"
printf '#!/usr/bin/env bash\nprintf "unexpected stale pnpm\\n" >&2\nexit 1\n' > "${STALE_BIN}/pnpm"
printf '#!/usr/bin/env bash\nprintf "v24.19.0\\n"\n' > "${PINNED_BIN}/node"
printf '#!/usr/bin/env bash\nprintf "11.13.1\\n"\n' > "${PINNED_BIN}/pnpm"
chmod +x "${STALE_BIN}/node" "${STALE_BIN}/pnpm" "${PINNED_BIN}/node" "${PINNED_BIN}/pnpm"

runtime_output="$(
  env \
    HOME="${TEST_ROOT}/home" \
    NVM_DIR="${TEST_ROOT}/nvm" \
    PATH="${STALE_BIN}:/usr/bin:/bin" \
    /bin/bash "${REPOSITORY_ROOT}/scripts/dev/tauri-regtest.sh" --check-runtime
)"

if [[ "${runtime_output}" != "Node v24.19.0 · pnpm 11.13.1" ]]; then
  echo "The native launcher did not replace the stale Node runtime." >&2
  printf 'Received: %s\n' "${runtime_output}" >&2
  exit 1
fi

IOS_CONFIG="${REPOSITORY_ROOT}/src-tauri/tauri.ios.conf.json"
IOS_LAUNCHER="${REPOSITORY_ROOT}/scripts/dev/tauri-ios-regtest.sh"

rg -Fq '"identifier": "app.groot.wallet.regtest.dev"' "${IOS_CONFIG}" || {
  echo "The iOS development config must use the isolated Regtest bundle identifier." >&2
  exit 1
}
rg -Fq '"beforeDevCommand": "pnpm dev:regtest"' "${IOS_CONFIG}" || {
  echo "The iOS development config must launch the Regtest frontend." >&2
  exit 1
}
rg -Fq 'export GROOT_BUILD_NETWORK=regtest' "${IOS_LAUNCHER}" || {
  echo "The iOS development launcher must compile for Regtest." >&2
  exit 1
}
rg -Fq 'export PUBLIC_BITCOIN_NETWORK=regtest' "${IOS_LAUNCHER}" || {
  echo "The iOS Regtest launcher must set the webview network to Regtest." >&2
  exit 1
}

if ios_usage_output="$(/bin/bash "${IOS_LAUNCHER}" 2>&1)"; then
  echo "The iOS development launcher accepted a missing target." >&2
  exit 1
fi
if [[ "${ios_usage_output}" != *"An explicit target is required"* ]]; then
  echo "The iOS development launcher did not explain its explicit-target requirement." >&2
  exit 1
fi

echo "Native development runtime launcher passed."
