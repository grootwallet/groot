export const releaseNotes = [
  'Component-scoped styles with desktop and mobile layout checks in both themes.',
  'Clearer activity pagination, tooltips and QR scan errors.',
  'Accepted broadcasts keep their successful result when local recording needs a retry.',
  'Wallet operations run off the UI thread and recheck wallet selection before changing data.',
  'Testnet4 iPhone software wallets and QR multisig signing with native recovery and device-authorized key access.'
] as const;
export const experimentalPlatformWarning =
  'Windows and Linux are experimental and untested on physical machines. They are riskier than macOS: native seed creation/recovery and USB device discovery are unavailable. Test public-wallet and file-signing flows and report feedback.';
export const publicReleaseDetails = [
  ...releaseNotes,
  'Internal release candidate for regression testing. Independent source review, release gates and hardware-signer certification remain required before public release.'
] as const;
