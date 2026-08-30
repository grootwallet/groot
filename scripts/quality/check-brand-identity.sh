#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
  echo "Groot brand identity gate failed: $1" >&2
  exit 1
}

run_search() {
  local status
  if "$@" >/dev/null; then
    return 0
  else
    status=$?
  fi
  if [[ "${status}" == 1 ]]; then
    return 1
  fi
  fail "brand identity search failed"
}

if command -v rg >/dev/null 2>&1; then
  contains_fixed() { run_search rg -F -- "$1" "$2"; }
  contains_regex() {
    local pattern="$1"
    shift
    run_search rg -n --hidden --no-ignore -- "${pattern}" "$@"
  }
  contains_deprecated_brand() {
    run_search rg -n --hidden --no-ignore 'Satchel' src e2e static src-tauri/Info.plist src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/app-icon.svg \
      --glob '!e2e/branding.spec.ts'
  }
elif command -v grep >/dev/null 2>&1 && command -v find >/dev/null 2>&1; then
  contains_fixed() { run_search grep -F -- "$1" "$2"; }
  contains_regex() {
    local pattern="$1"
    shift
    run_search grep -RInE -- "${pattern}" "$@"
  }
  contains_deprecated_brand() {
    if run_search grep -RIn -- 'Satchel' src static; then
      return 0
    fi
    if run_search grep -n -- 'Satchel' src-tauri/Info.plist src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/app-icon.svg; then
      return 0
    fi
    if ! find e2e -type f ! -path 'e2e/branding.spec.ts' -print >/dev/null; then
      fail "brand identity file discovery failed"
    fi
    local file
    while IFS= read -r -d '' file; do
      if run_search grep -n -- 'Satchel' "${file}"; then
        return 0
      fi
    done < <(find e2e -type f ! -path 'e2e/branding.spec.ts' -print0)
    return 1
  }
else
  fail "ripgrep or system grep/find are required"
fi

contains_fixed '"productName": "Groot"' src-tauri/tauri.conf.json || fail "Tauri product name is not Groot"
contains_fixed '"mainBinaryName": "Groot"' src-tauri/tauri.conf.json || fail "native application binary name is not Groot"
contains_fixed '"title": "Groot"' src-tauri/tauri.conf.json || fail "native window title is not Groot"
contains_fixed '"identifier": "app.groot.wallet"' src-tauri/tauri.conf.json || fail "Tauri bundle identifier is not Groot"
contains_fixed '"name": "groot-wallet"' package.json || fail "package metadata is not Groot"
contains_fixed 'name = "groot"' src-tauri/Cargo.toml || fail "Rust package metadata is not Groot"
contains_fixed 'name = "Groot"' src-tauri/Cargo.toml || fail "Cargo development executable name is not Groot"
contains_fixed '<title>Groot</title>' src/routes/+layout.svelte || fail "webview title is not Groot"

contains_fixed 'M512 100C100 100 100 100 100 512C100 924 100 924 512 924C924 924 924 924 924 512C924 100 924 100 512 100Z' assets/brand/app-icon-legacy-source.svg || fail "legacy icon does not use the approved continuous-corner footprint"
contains_fixed 'translate(219 219) scale(4.578)' assets/brand/app-icon-legacy-source.svg || fail "legacy icon mark padding changed"
contains_fixed 'translate(219 219) scale(4.578)' assets/brand/app-icon-layered-source.svg || fail "modern icon mark padding changed"
contains_fixed '<rect width="1024" height="1024" fill="#102A4C"/>' assets/brand/app-icon-layers/01-background.svg || fail "Apple icon background layer is missing or masked"
contains_fixed 'translate(219 219) scale(4.578)' assets/brand/app-icon-layers/02-control.svg || fail "Apple icon foreground layer padding changed"

if contains_regex '<rect[^>]+rx=' assets/brand/app-icon-layered-source.svg assets/brand/app-icon-layers; then
  fail "modern Apple icon artwork must remain square and unmasked"
fi

cmp -s assets/brand/app-icon-legacy-source.svg src-tauri/icons/macos-icon-source.svg || fail "macOS fallback mirror is stale; run pnpm brand:icons"

if contains_deprecated_brand; then
  fail "a current user-facing surface still contains Satchel"
fi

echo "Groot brand identity gate: public and technical namespaces updated."
