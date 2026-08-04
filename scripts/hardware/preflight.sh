#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

HWI_EXECUTABLE="${SATCHEL_HWI_PATH:-}"
if [[ -z "${HWI_EXECUTABLE}" ]]; then
  for candidate in /opt/homebrew/bin/hwi /usr/local/bin/hwi /usr/bin/hwi; do
    if [[ -x "${candidate}" ]]; then HWI_EXECUTABLE="${candidate}"; break; fi
  done
fi
if [[ -z "${HWI_EXECUTABLE}" || "${HWI_EXECUTABLE}" != /* || ! -x "${HWI_EXECUTABLE}" ]]; then
  echo "Bitcoin Core HWI was not found at a trusted absolute path." >&2
  echo "Install HWI or compile with an absolute SATCHEL_HWI_PATH, then rerun this preflight." >&2
  exit 1
fi

echo "HWI version"
"${HWI_EXECUTABLE}" --version
echo
echo "Connected test-chain devices"
echo "Review locally. Do not paste this output into issues or commit it; it may contain a fingerprint and device path."
"${HWI_EXECUTABLE}" --chain test enumerate
echo
echo "Preflight complete. Continue with docs/hardware-certification.md."
