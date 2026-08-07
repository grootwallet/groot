#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /absolute/path/to/Satchel.app" >&2
  exit 2
fi
app="$1"
[[ "$app" = /* && -d "$app" ]] || { echo "Pass an absolute path to Satchel.app." >&2; exit 1; }

codesign --verify --deep --strict --verbose=2 "$app"
spctl --assess --type execute --verbose=2 "$app"
codesign -d --entitlements :- "$app"
echo "Signature, Gatekeeper assessment, and entitlements verified."
