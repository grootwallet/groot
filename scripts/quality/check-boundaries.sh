#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Architecture boundary failed: $1" >&2
  exit 1
}

command -v rg >/dev/null 2>&1 || fail "ripgrep (rg) is required"

if rg -n "wallet/(dummy|tauri)" src/routes src/lib/components; then
  fail "routes/components must depend on WalletPort through the wallet composition root"
fi

if rg -n "@tauri-apps/(api|plugin-)" src/routes src/lib/components; then
  fail "routes/components must not call Tauri APIs directly"
fi

if rg -n "\binvoke\s*\(" src --glob '!lib/wallet/tauri.ts'; then
  fail "Tauri invoke is allowed only in src/lib/wallet/tauri.ts"
fi

if rg -n "\bfetch\s*\(" src/routes src/lib/components; then
  fail "network calls belong behind WalletPort or a dedicated adapter"
fi

if rg -n "console\.(log|debug|info|warn|error)" src src-tauri/src; then
  fail "wallet code must not add unreviewed console logging"
fi

echo "Architecture boundaries: clean."
