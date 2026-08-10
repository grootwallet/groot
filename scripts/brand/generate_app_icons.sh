#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/groot-app-icons.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

# Desktop formats still require a flattened fallback. Its 824/1024 optical
# footprint leaves the system room for selection, shadows, and Dock treatment.
pnpm tauri icon assets/brand/app-icon-legacy-source.svg \
  --output src-tauri/icons \
  --ios-color '#102A4C'
cp assets/brand/app-icon-legacy-source.svg src-tauri/icons/macos-icon-source.svg

# Apple mobile icons must be supplied as square, unmasked artwork. Replace the
# fallback iOS exports with renders from the modern composite source so iOS is
# the only component that applies the final icon mask.
pnpm tauri icon assets/brand/app-icon-layered-source.svg \
  --output "$temporary_root/modern" \
  --ios-color '#102A4C'
rsync -a "$temporary_root/modern/ios/" src-tauri/icons/ios/

echo "Generated Groot desktop and mobile application icons."
