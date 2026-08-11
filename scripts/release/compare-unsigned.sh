#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 /path/to/build-a /path/to/build-b" >&2
  exit 2
fi

first_dir="${1%/}"
second_dir="${2%/}"
expected_files=(BUILD-INFO Groot SHA256SUMS groot.cdx.json)

validate_evidence() {
  local directory="$1"
  local actual_files
  local expected_sums

  [[ -d "${directory}" && ! -L "${directory}" ]] || {
    echo "Evidence directory is missing, invalid, or symlinked: ${directory}" >&2
    exit 1
  }
  for filename in "${expected_files[@]}"; do
    [[ -f "${directory}/${filename}" && ! -L "${directory}/${filename}" ]] || {
      echo "Evidence file is missing, invalid, or symlinked: ${directory}/${filename}" >&2
      exit 1
    }
  done
  actual_files="$(find "${directory}" -mindepth 1 -maxdepth 1 -print | sed 's#.*/##' | LC_ALL=C sort)"
  [[ "${actual_files}" == $'BUILD-INFO\nGroot\nSHA256SUMS\ngroot.cdx.json' ]] || {
    echo "Evidence directory contains missing or unexpected files: ${directory}" >&2
    exit 1
  }
  expected_sums="$(cd "${directory}" && shasum -a 256 Groot groot.cdx.json)"
  [[ "$(cat "${directory}/SHA256SUMS")" == "${expected_sums}" ]] || {
    echo "Recorded artifact digests are invalid: ${directory}/SHA256SUMS" >&2
    exit 1
  }
}

validate_evidence "${first_dir}"
validate_evidence "${second_dir}"

first_hash="$(shasum -a 256 "${first_dir}/Groot" | awk '{print $1}')"
second_hash="$(shasum -a 256 "${second_dir}/Groot" | awk '{print $1}')"
printf 'build-a %s\nbuild-b %s\n' "$first_hash" "$second_hash"
for filename in "${expected_files[@]}"; do
  cmp -s "${first_dir}/${filename}" "${second_dir}/${filename}" || {
    echo "Unsigned release evidence differs: ${filename}" >&2
    exit 1
  }
done
echo "Unsigned binaries, SBOMs, digests, and build environments are byte-identical."
