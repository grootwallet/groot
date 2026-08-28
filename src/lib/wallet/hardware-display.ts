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
  usesRegtestEncoding: boolean;
};

export function hardwareAddressComparison(
  canonical: string,
  testnetAlias: string | null | undefined,
  deviceIdentity: string,
  hardwareDisplayAlias?: string | null
): HardwareAddressComparison {
  const normalized = deviceIdentity.toLowerCase();
  if (hardwareDisplayAlias && normalized.includes('coldcard')) {
    return {
      address: hardwareDisplayAlias,
      deviceName: 'Coldcard',
      usesRegtestEncoding: true
    };
  }
  const deviceName = testnetAlias ? testnetAddressDisplayName(deviceIdentity) : null;
  return {
    address: deviceName ? testnetAlias! : canonical,
    deviceName,
    usesRegtestEncoding: false
  };
}

export function addressForHardwareDisplay(
  canonical: string,
  testnetAlias: string | null | undefined,
  deviceIdentity: string,
  hardwareDisplayAlias?: string | null
) {
  return hardwareAddressComparison(canonical, testnetAlias, deviceIdentity, hardwareDisplayAlias)
    .address;
}
