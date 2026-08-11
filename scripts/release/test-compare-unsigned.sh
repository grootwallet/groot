#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/groot-release-compare.XXXXXX")"
trap 'rm -rf "${test_root}"' EXIT

make_evidence() {
  local directory="$1"
  mkdir -p "${directory}"
  printf 'deterministic binary\n' > "${directory}/Groot"
  printf '{"bomFormat":"CycloneDX"}\n' > "${directory}/groot.cdx.json"
  printf '%s\n' \
    'commit=0123456789abcdef0123456789abcdef01234567' \
    'source_date_epoch=1786363200' \
    'compiled_network=regtest' \
    'rustc=rustc 1.91.1' \
    'cargo=cargo 1.91.1' \
    'target=aarch64-apple-darwin' \
    'node=v24.19.0' \
    'pnpm=11.13.1' \
    'tauri=tauri-cli 2.11.4' \
    'os=Darwin 25.6.0 arm64' \
    'sdk=macOS 26.0' \
    'cargo_lock_sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
    'pnpm_lock_sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
    > "${directory}/BUILD-INFO"
  (
    cd "${directory}"
    shasum -a 256 Groot groot.cdx.json > SHA256SUMS
  )
}

expect_rejection() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "Comparator accepted ${description}." >&2
    exit 1
  fi
}

first="${test_root}/first"
second="${test_root}/second"
make_evidence "${first}"
make_evidence "${second}"

bash "${repository_root}/scripts/release/compare-unsigned.sh" "${first}" "${second}" >/dev/null

printf 'tampered\n' >> "${second}/Groot"
expect_rejection "a binary whose recorded digest is stale" \
  bash "${repository_root}/scripts/release/compare-unsigned.sh" "${first}" "${second}"
make_evidence "${second}"

printf 'different environment\n' >> "${second}/BUILD-INFO"
expect_rejection "different build metadata" \
  bash "${repository_root}/scripts/release/compare-unsigned.sh" "${first}" "${second}"
make_evidence "${second}"

printf 'unexpected\n' > "${second}/extra"
expect_rejection "an unexpected evidence file" \
  bash "${repository_root}/scripts/release/compare-unsigned.sh" "${first}" "${second}"
rm "${second}/extra"

mv "${second}/Groot" "${second}/real-Groot"
ln -s real-Groot "${second}/Groot"
expect_rejection "a symlinked artifact" \
  bash "${repository_root}/scripts/release/compare-unsigned.sh" "${first}" "${second}"

echo "Unsigned release comparator rejects incomplete, substituted, and mismatched evidence."
