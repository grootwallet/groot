export const releaseNotes = [
  'Maintenance work makes wallet screens, restart recovery and device operations more predictable.',
  'Windows and Ubuntu Testnet4 builds now bundle the verified fast HWI runtime for physical testing.',
  'Version numbering returns to the pre-1.0 line with the 0.5.4 candidate.',
  'Testnet4 preview: pair an iPhone key and sign multisig transactions by QR; unavailable on Mainnet.',
  'Test-network preview: Partner and Family Continuity wallets with Miniscript recovery paths; unavailable on Mainnet.'
] as const;
export const experimentalPlatformWarning =
  'Windows and Linux are experimental Testnet4 platforms. Their bundled HWI runtime and device discovery have automated checks, but physical model testing and production signing remain incomplete. Use disposable wallets and Testnet4 bitcoin.';
export const publicReleaseDetails = releaseNotes;
