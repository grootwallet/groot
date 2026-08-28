#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/groot-sbom.XXXXXX")"
first="$scratch/first.cdx.json"
second="$scratch/second.cdx.json"
artifact="$scratch/Groot"
cleanup() {
  rm -f -- "$first" "$second" "$artifact"
  rmdir -- "$scratch"
}
trap cleanup EXIT

tracked_sboms="$(git -C "$repo_root" ls-files -- '*.cdx.json' '*.cdx.xml' '*.spdx.json' '*.spdx.xml')"
if [[ -n "$tracked_sboms" ]]; then
  echo "Generated SBOMs are build evidence and must not be committed:" >&2
  printf '%s\n' "$tracked_sboms" >&2
  exit 1
fi

printf 'deterministic Groot artifact fixture\n' > "$artifact"
node "$repo_root/scripts/release/generate-sbom.mjs" "$first" "$artifact"
node "$repo_root/scripts/release/generate-sbom.mjs" "$second" "$artifact"
cmp --silent "$first" "$second" || {
  echo "SBOM generation is not deterministic." >&2
  exit 1
}
node -e '
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  const childProcess = require("node:child_process");
  const sbom = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const artifact = fs.readFileSync(process.argv[2]);
  const property = (name) => sbom.metadata.component.properties.find((item) => item.name === name)?.value;
  if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.6") process.exit(1);
  if (!Array.isArray(sbom.components) || sbom.components.length < 2) process.exit(1);
  if (sbom.components.some((item) => !item.purl || !item.version || !item.licenses?.length)) process.exit(1);
  if (new Set(sbom.components.map((item) => item["bom-ref"])).size !== sbom.components.length) process.exit(1);
  if (property("groot:commit") !== childProcess.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()) process.exit(1);
  for (const [name, path] of [["groot:cargo-lock-sha256", "src-tauri/Cargo.lock"], ["groot:pnpm-lock-sha256", "pnpm-lock.yaml"]]) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
    if (property(name) !== digest) process.exit(1);
  }
  const artifactDigest = crypto.createHash("sha256").update(artifact).digest("hex");
  if (sbom.metadata.component.hashes?.[0]?.alg !== "SHA-256" || sbom.metadata.component.hashes[0].content !== artifactDigest) process.exit(1);
  if (property("groot:artifact-filename") !== "Groot") process.exit(1);
' "$first" "$artifact" || { echo "SBOM structure, source identity, artifact binding, or license evidence is incomplete." >&2; exit 1; }
echo "SBOM generation, locked-source identity, artifact binding, and license evidence are deterministic."
