#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/groot-sbom.XXXXXX")"
first="$scratch/first.cdx.json"
second="$scratch/second.cdx.json"
cleanup() {
  rm -f -- "$first" "$second"
  rmdir -- "$scratch"
}
trap cleanup EXIT

node "$repo_root/scripts/release/generate-sbom.mjs" "$first"
node "$repo_root/scripts/release/generate-sbom.mjs" "$second"
cmp --silent "$first" "$second" || {
  echo "SBOM generation is not deterministic." >&2
  exit 1
}
node -e '
  const fs = require("node:fs");
  const sbom = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.6") process.exit(1);
  if (!Array.isArray(sbom.components) || sbom.components.length < 2) process.exit(1);
  if (sbom.components.some((item) => !item.purl || !item.version || !item.licenses?.length)) process.exit(1);
  if (new Set(sbom.components.map((item) => item["bom-ref"])).size !== sbom.components.length) process.exit(1);
' "$first" || { echo "SBOM structure or license evidence is incomplete." >&2; exit 1; }
echo "SBOM generation and license evidence are deterministic."
