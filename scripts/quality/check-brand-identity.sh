#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Groot brand identity gate failed: $1" >&2
  exit 1
}

contains_fixed() { rg -F -- "$1" "$2" >/dev/null; }

contains_fixed '"productName": "Groot"' src-tauri/tauri.conf.json || fail "Tauri product name is not Groot"
contains_fixed '"title": "Groot"' src-tauri/tauri.conf.json || fail "native window title is not Groot"
contains_fixed '"identifier": "app.satchel.wallet"' src-tauri/tauri.conf.json || fail "legacy bundle identifier changed"
contains_fixed 'const KEYCHAIN_SERVICE: &str = "app.satchel.wallet.device-wrap.v1";' src-tauri/src/secure_store.rs || fail "legacy Keychain service changed"
contains_fixed '"name": "groot-wallet"' package.json || fail "package metadata is not Groot"
contains_fixed 'name = "groot"' src-tauri/Cargo.toml || fail "Rust package metadata is not Groot"
contains_fixed ": 'Groot'" src/routes/+layout.svelte || fail "webview title is not Groot"

if rg -n 'Satchel' src e2e static src-tauri/Info.plist src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/app-icon.svg \
  --glob '!src-tauri/target/**' --glob '!e2e/branding.spec.ts' >/dev/null; then
  fail "a current user-facing surface still contains Satchel"
fi

echo "Groot brand identity gate: public name updated; compatibility identifiers preserved."
