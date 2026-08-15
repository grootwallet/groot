import { pathToFileURL } from 'node:url';

const jadeMessage = (model, rawError) => {
  if (rawError.includes('-32000')) {
    return `${model}: detected; login canceled (start again and enter the PIN on Jade)`;
  }
  if (rawError.includes('-32003')) {
    return `${model}: detected; wallet network mismatch (use a Testnet-configured Jade for Groot Regtest)`;
  }
  return `${model}: detected; log in on Jade and keep it connected over USB`;
};

export const summarizeEnumeration = (input) => {
  let devices;
  try {
    devices = JSON.parse(input);
  } catch {
    return { lines: ['HWI returned an unreadable device list.'], status: 4 };
  }
  if (!Array.isArray(devices)) {
    return { lines: ['HWI returned an unreadable device list.'], status: 4 };
  }
  if (devices.length === 0) {
    return { lines: ['No hardware wallet detected.'], status: 2 };
  }

  const lines = [];
  let actionable = 0;
  for (const device of devices) {
    const model = device.model || device.type || 'Unknown device';
    const warnings = Array.isArray(device.warnings)
      ? device.warnings.flat().join(' ').toLowerCase()
      : '';
    const rawError = `${device.error || ''} ${device.message || ''}`.toLowerCase();
    if (warnings.includes('passphrase') && warnings.includes('empty string')) {
      actionable += 1;
      lines.push(
        `${model}: detected; choose the standard no-passphrase wallet explicitly in Groot, or select a hidden wallet on-device when supported`
      );
    } else if (device.type === 'ledger' && device.fingerprint) {
      actionable += 1;
      lines.push(
        `${model}: detected; for Regtest open Bitcoin Test—not Bitcoin; Groot verifies the app when reading the public account key`
      );
    } else if (device.fingerprint) {
      actionable += 1;
      lines.push(`${model}: ready`);
    } else if (
      (device.type === 'trezor' || device.type === 'keepkey') &&
      (device.needs_pin_sent || device.code === -12)
    ) {
      actionable += 1;
      lines.push(`${model}: detected; locked (use Groot’s PIN matrix)`);
    } else if (device.type === 'bitbox02' && device.code === -12) {
      lines.push(
        `${model}: detected; open and unlock the wallet in BitBoxApp, then quit BitBoxApp completely before rescanning`
      );
    } else if (device.type === 'jade') {
      lines.push(jadeMessage(model, rawError));
    } else if (device.type === 'ledger') {
      lines.push(
        `${model}: detected; for this Regtest build quit Ledger Live, unlock and open Bitcoin Test—not Bitcoin—then approve public-key export on-device`
      );
    } else if (device.type === 'coldcard') {
      lines.push(`${model}: detected; unlock and enable USB communication`);
    } else {
      lines.push(
        `${model}: detected; not ready (HWI code ${Number.isInteger(device.code) ? device.code : 'unknown'})`
      );
    }
  }
  return { lines, status: actionable === 0 ? 3 : 0 };
};

const run = async () => {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const result = summarizeEnumeration(input);
  console.log(result.lines.join('\n'));
  process.exitCode = result.status;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
