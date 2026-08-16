export function testnetAddressDisplayName(deviceIdentity: string) {
  const normalized = deviceIdentity.toLowerCase();
  if (normalized.includes('ledger')) return 'Ledger Bitcoin Test';
  if (normalized.includes('trezor')) return 'Trezor';
  if (normalized.includes('bitbox')) return 'BitBox02';
  return null;
}

export type HardwareAddressComparison = {
  address: string;
  deviceName: string | null;
};

export function hardwareAddressComparison(
  canonical: string,
  testnetAlias: string | null | undefined,
  deviceIdentity: string
): HardwareAddressComparison {
  const deviceName = testnetAlias ? testnetAddressDisplayName(deviceIdentity) : null;
  return { address: deviceName ? testnetAlias! : canonical, deviceName };
}

export function addressForHardwareDisplay(
  canonical: string,
  testnetAlias: string | null | undefined,
  deviceIdentity: string
) {
  return hardwareAddressComparison(canonical, testnetAlias, deviceIdentity).address;
}
