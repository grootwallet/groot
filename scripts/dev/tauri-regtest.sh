#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
REQUIRED_NODE_VERSION="$(tr -d '[:space:]' < "${REPOSITORY_ROOT}/.node-version")"
REQUIRED_PNPM_VERSION="11.13.1"

if [[ ! "${REQUIRED_NODE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Satchel's .node-version is not an exact semantic version." >&2
  exit 1
fi

current_node_version="$(node --version 2>/dev/null || true)"
if [[ "${current_node_version}" != "v${REQUIRED_NODE_VERSION}" ]]; then
  node_install_roots=()
  if [[ -n "${NVM_DIR:-}" ]]; then
    node_install_roots+=("${NVM_DIR}")
  fi
  node_install_roots+=("${HOME}/.nvm")

  pinned_node_bin=""
  for node_install_root in "${node_install_roots[@]}"; do
    candidate_bin="${node_install_root}/versions/node/v${REQUIRED_NODE_VERSION}/bin"
    if [[ -x "${candidate_bin}/node" ]] &&
      [[ "$("${candidate_bin}/node" --version 2>/dev/null || true)" == "v${REQUIRED_NODE_VERSION}" ]]; then
      pinned_node_bin="$(cd "${candidate_bin}" && pwd -P)"
      break
    fi
  done

  if [[ -z "${pinned_node_bin}" ]]; then
    echo "Satchel requires Node ${REQUIRED_NODE_VERSION}, but the current shell has ${current_node_version:-no Node}." >&2
    echo "Install it with 'nvm install ${REQUIRED_NODE_VERSION}', then rerun this launcher." >&2
    exit 1
  fi

  export PATH="${pinned_node_bin}:${PATH}"
  hash -r
fi

if [[ "$(node --version)" != "v${REQUIRED_NODE_VERSION}" ]]; then
  echo "Could not activate Satchel's pinned Node ${REQUIRED_NODE_VERSION} runtime." >&2
  exit 1
fi

current_pnpm_version="$(pnpm --version 2>/dev/null || true)"
if [[ "${current_pnpm_version}" != "${REQUIRED_PNPM_VERSION}" ]]; then
  echo "Satchel requires pnpm ${REQUIRED_PNPM_VERSION}, but the active runtime has ${current_pnpm_version:-no pnpm}." >&2
  echo "Run 'corepack prepare pnpm@${REQUIRED_PNPM_VERSION} --activate', then rerun this launcher." >&2
  exit 1
fi

if [[ "${1:-}" == "--check-runtime" ]]; then
  printf 'Node %s · pnpm %s\n' "$(node --version)" "${current_pnpm_version}"
  exit 0
fi

if [[ "$#" -ne 0 ]]; then
  echo "Usage: bash scripts/dev/tauri-regtest.sh [--check-runtime]" >&2
  exit 1
fi

cd "${REPOSITORY_ROOT}"
exec pnpm tauri dev
