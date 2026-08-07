#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 /path/to/build-a /path/to/build-b" >&2
  exit 2
fi

first="$1/satchel"
second="$2/satchel"
[[ -f "$first" && -f "$second" ]] || { echo "Both directories must contain a satchel binary." >&2; exit 1; }

first_hash="$(shasum -a 256 "$first" | awk '{print $1}')"
second_hash="$(shasum -a 256 "$second" | awk '{print $1}')"
printf 'build-a %s\nbuild-b %s\n' "$first_hash" "$second_hash"
[[ "$first_hash" == "$second_hash" ]] || { echo "Unsigned builds differ." >&2; exit 1; }
echo "Unsigned builds are byte-identical."
