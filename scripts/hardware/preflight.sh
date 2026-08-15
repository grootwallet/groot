#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

HWI_EXECUTABLE="${GROOT_HWI_PATH:-}"
if [[ -z "${HWI_EXECUTABLE}" ]]; then
  for candidate in /opt/homebrew/bin/hwi /usr/local/bin/hwi /usr/bin/hwi; do
    if [[ -x "${candidate}" ]]; then HWI_EXECUTABLE="${candidate}"; break; fi
  done
fi
if [[ -z "${HWI_EXECUTABLE}" || "${HWI_EXECUTABLE}" != /* || ! -x "${HWI_EXECUTABLE}" ]]; then
  echo "Bitcoin Core HWI was not found at a trusted absolute path." >&2
  echo "Install HWI or compile with an absolute GROOT_HWI_PATH, then rerun this preflight." >&2
  exit 1
fi

echo "HWI version"
"${HWI_EXECUTABLE}" --version
echo
echo "Connected regtest devices"
echo "Only device model and readiness are printed. Fingerprints and device paths stay hidden."
HWI_STDERR="$(mktemp)"
trap 'rm -f "${HWI_STDERR}"' EXIT
if ! HWI_DEVICES="$(node scripts/hardware/run-hwi-enumerate.mjs "${HWI_EXECUTABLE}" 2>"${HWI_STDERR}")"; then
  if grep -q '^GROOT_HWI_ENUMERATION_TIMEOUT$' "${HWI_STDERR}"; then
    echo "HWI device scan timed out safely." >&2
    echo "Finish or cancel the hardware-wallet prompt, then retry." >&2
  elif grep -q '^GROOT_HWI_ENUMERATION_OUTPUT_LIMIT$' "${HWI_STDERR}"; then
    echo "HWI device scan exceeded the safe output limit." >&2
    echo "Disconnect the device and retry; do not paste raw HWI output." >&2
  else
    echo "HWI enumeration failed before a safe device summary could be produced." >&2
    echo "Close other wallet software, reconnect and unlock the device, then retry." >&2
  fi
  exit 1
fi
HWI_SUMMARY="$(node scripts/hardware/summarize-enumeration.mjs <<<"${HWI_DEVICES}")" || HWI_SUMMARY_STATUS=$?
printf '%s\n' "${HWI_SUMMARY}"
if [[ "${HWI_SUMMARY_STATUS:-0}" -eq 3 ]]; then
  echo
  echo "No device can continue in Groot yet. Follow the device-specific action above, then rescan." >&2
  exit 1
fi
if [[ "${HWI_SUMMARY_STATUS:-0}" -ne 0 ]]; then
  exit 1
fi
echo
echo "Preflight complete. Continue with docs/hardware-certification.md."
