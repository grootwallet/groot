export const releaseNotes = [
  'Seven hardware signers now connect, identify, verify addresses and sign much faster.',
  'A simpler start page helps you create, connect or recover a wallet.',
  'Mainnet payments no longer have a 0.01 BTC app limit; transaction and fee checks still apply.',
  'Wallet scans show progress sooner, with clearer activity, errors and payment results.',
  'Testnet4 preview: pair an iPhone key and sign multisig transactions by QR; unavailable on Mainnet.',
  'Test-network preview: Partner and Family Continuity wallets with Miniscript recovery paths; unavailable on Mainnet.'
] as const;
export const experimentalPlatformWarning =
  'Windows and Linux are experimental and untested on physical machines. They are riskier than macOS: native seed creation/recovery and USB device discovery are unavailable. Test public-wallet and file-signing flows and report feedback.';
export const publicReleaseDetails = releaseNotes;
