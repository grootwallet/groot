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

echo "Native development runtime launcher passed."
