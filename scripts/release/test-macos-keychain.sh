#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$(uname -s)" == "Darwin" ]] || {
  echo "The real Keychain lifecycle test requires macOS." >&2
  exit 1
}

cd "$repo_root/src-tauri"
if ! cargo test --locked --lib secure_store::tests::macos_keychain_create_restart_restore_and_delete_lifecycle -- --ignored --exact; then
  echo "The disposable Keychain test failed. Run it from the signed candidate environment with an unlocked login Keychain; do not weaken Keychain access controls." >&2
  exit 1
fi
