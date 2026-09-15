#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Architecture boundary failed: $1" >&2
  exit 1
}

if command -v rg >/dev/null 2>&1; then
  search() { rg -n -- "$@"; }
  search_without_tauri_adapter() { rg -n --glob '!lib/wallet/tauri.ts' -- "$1" src; }
elif command -v grep >/dev/null 2>&1; then
  search() {
    local pattern="$1"
    shift
    grep -RInE -- "$pattern" "$@"
  }
  search_without_tauri_adapter() {
    grep -RInE --exclude='tauri.ts' -- "$1" src
  }
else
  fail "ripgrep or grep is required"
fi

if search "wallet/(dummy|tauri)" src/routes src/lib/components; then
  fail "routes/components must depend on WalletPort through the wallet composition root"
fi

if search "@tauri-apps/(api|plugin-)" src/routes src/lib/components; then
  fail "routes/components must not call Tauri APIs directly"
fi

if search_without_tauri_adapter "invoke[[:space:]]*\("; then
  fail "Tauri invoke is allowed only in src/lib/wallet/tauri.ts"
fi

if search "fetch[[:space:]]*\(" src/routes src/lib/components; then
  fail "network calls belong behind WalletPort or a dedicated adapter"
fi

if search "console\.(log|debug|info|warn|error)" src src-tauri/src; then
  fail "wallet code must not add unreviewed console logging"
fi

unexpected_stores="$(find src/lib/stores -maxdepth 1 -type f -name '*.ts' ! -name 'toasts.ts' -print)"
if [[ -n "$unexpected_stores" ]]; then
  fail "process-wide Svelte stores require an explicit lifetime/identity decision; found: $unexpected_stores"
fi

python3 -m unittest discover -s services/core-gateway/tests -v ||
  fail "narrow Core gateway boundary tests failed"

echo "Architecture boundaries: clean."
