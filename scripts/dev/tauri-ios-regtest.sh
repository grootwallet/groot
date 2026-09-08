#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ "$#" -ne 1 || -z "${1}" || "${1}" == -* ]]; then
  echo "Usage: bash scripts/dev/tauri-ios-regtest.sh <simulator-or-device-name>" >&2
  echo "An explicit target is required so Tauri cannot select a connected iPhone by accident." >&2
  exit 1
fi

if [[ ! -d "${REPOSITORY_ROOT}/src-tauri/gen/apple/groot.xcodeproj" ]]; then
  echo "The generated iOS project is missing." >&2
  echo "Run 'pnpm tauri ios init --ci', inspect the isolated bundle identifier, then retry." >&2
  exit 1
fi

export GROOT_BUILD_NETWORK=regtest
export PUBLIC_BITCOIN_NETWORK=regtest

cd "${REPOSITORY_ROOT}"
exec pnpm tauri ios dev "${1}" --config src-tauri/tauri.ios.conf.json
