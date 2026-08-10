export function addressForHardwareDisplay(canonical: string, testnetAlias: string | null | undefined, deviceIdentity: string) {
  return deviceIdentity.toLowerCase().includes('ledger') && testnetAlias ? testnetAlias : canonical;
}
