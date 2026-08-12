export function testnetAddressDisplayName(deviceIdentity: string) {
  const normalized = deviceIdentity.toLowerCase();
  if (normalized.includes('ledger')) return 'Ledger Bitcoin Test';
  if (normalized.includes('trezor')) return 'Trezor';
  return null;
}

export function addressForHardwareDisplay(canonical: string, testnetAlias: string | null | undefined, deviceIdentity: string) {
  return testnetAddressDisplayName(deviceIdentity) && testnetAlias ? testnetAlias : canonical;
}
