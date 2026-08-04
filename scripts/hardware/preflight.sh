#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v hwi >/dev/null 2>&1; then
  echo "Bitcoin Core HWI is not installed or is not on PATH." >&2
  echo "Install HWI, reconnect the device, then rerun: pnpm hardware:preflight" >&2
  exit 1
fi

echo "HWI version"
hwi --version
echo
echo "Connected test-chain devices"
echo "Review locally. Do not paste this output into issues or commit it; it may contain a fingerprint and device path."
hwi --chain test enumerate
echo
echo "Preflight complete. Continue with docs/hardware-certification.md."
