/** Route-local result lifetimes. This does not cancel or authorize native work. */
export function createSettingsActions(selectedWalletId: () => string | null) {
  const versions = new Map<string, number>();
  let active = true;

  function invalidate(name: string) {
    versions.set(name, (versions.get(name) ?? 0) + 1);
  }

  function begin(name: string) {
    invalidate(name);
    const version = versions.get(name);
    const walletId = selectedWalletId();
    return () => active && version === versions.get(name) && walletId === selectedWalletId();
  }

  function dispose() {
    active = false;
    versions.clear();
  }

  return { begin, invalidate, dispose };
}
