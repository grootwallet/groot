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
if ! HWI_DEVICES="$("${HWI_EXECUTABLE}" --chain regtest enumerate 2>"${HWI_STDERR}")"; then
  echo "HWI enumeration failed before a safe device summary could be produced." >&2
  echo "Close other wallet software, reconnect and unlock the device, then retry." >&2
  exit 1
fi
HWI_SUMMARY="$(node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const devices = JSON.parse(input);
    if (!Array.isArray(devices)) throw new Error("unexpected response");
    if (devices.length === 0) {
      console.log("No hardware wallet detected.");
      process.exitCode = 2;
      return;
    }
    let actionable = 0;
    for (const device of devices) {
      const model = device.model || device.type || "Unknown device";
      const warnings = Array.isArray(device.warnings) ? device.warnings.flat().join(" ").toLowerCase() : "";
      if (warnings.includes("passphrase") && warnings.includes("empty string")) {
        actionable += 1;
        console.log(`${model}: detected; choose the standard no-passphrase wallet explicitly in Groot, or select a hidden wallet on-device when supported`);
      } else if (device.type === "ledger" && device.fingerprint) {
        actionable += 1;
        console.log(`${model}: detected; for Regtest open Bitcoin Test—not Bitcoin; Groot verifies the app when reading the public account key`);
      } else if (device.fingerprint) {
        actionable += 1;
        console.log(`${model}: ready`);
      } else if ((device.type === "trezor" || device.type === "keepkey") && (device.needs_pin_sent || device.code === -12)) {
        actionable += 1;
        console.log(`${model}: detected; locked (use Groot’s PIN matrix)`);
      } else if (device.type === "bitbox02" && device.code === -12) {
        console.log(`${model}: detected; open and unlock the wallet in BitBoxApp, then quit BitBoxApp completely before rescanning`);
      } else if (device.type === "jade" && device.code === -12) {
        console.log(`${model}: detected; log in on-device with Recovery Phrase Login or QR PIN Unlock`);
      } else if (device.type === "ledger") {
        console.log(`${model}: detected; for this Regtest build quit Ledger Live, unlock and open Bitcoin Test—not Bitcoin—then approve public-key export on-device`);
      } else if (device.type === "coldcard") {
        console.log(`${model}: detected; unlock and enable USB communication`);
      } else {
        console.log(`${model}: detected; not ready (HWI code ${Number.isInteger(device.code) ? device.code : "unknown"})`);
      }
    }
    if (actionable === 0) process.exitCode = 3;
  } catch {
    console.error("HWI returned an unreadable device list.");
    process.exitCode = 4;
  }
});
' <<<"${HWI_DEVICES}")" || HWI_SUMMARY_STATUS=$?
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
