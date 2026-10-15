export const releaseNotes = [
  'Approve the first wallet-history scan or connect your own node, with clearer retry controls.',
  'Restore standard multisig backups and their address labels more reliably; inspect one receive/change descriptor.',
  'Change the app PIN for hardware and multisig wallets. Your software-wallet passphrase stays fixed.',
  'Clearer hardware identity and policy-address details, permanent-label entry and wallet deletion safeguards.',
  'Optional update checks, verified installer preparation and offline release notes; current guides consolidated.'
] as const;
export const experimentalPlatformWarning =
  'Windows and Linux are experimental and untested on physical machines. They are riskier than macOS: native seed creation/recovery and USB device discovery are unavailable. Test public-wallet and file-signing flows and report feedback.';
export const publicReleaseDetails = [
  "First-history approval starts a resumable genesis scan; choosing a private node opens its connection dialog directly, with retry after partial observations. Approval stays blocked until Groot can show the exact configured backend's privacy disclosure.",
  "Standard multisig restoration preserves the backup threshold and public origins. Restored BIP329 imports derive address ownership, reject additions beyond Groot's supported recovery gap, and retain current signer names for matching signer-key records.",
  'Hardware-only and multisig wallets can change their app PIN with current/new confirmation, encrypted rollback protection and a lock after success. Software BIP39 passphrases remain fixed.',
  'Policy first-address detail uses the shared derivation view for every device. Discovery candidates say Select to identify with amber badges; full account identity checks remain required.',
  'Address/xpub details group characters consistently. Public descriptor views, copy and text exports show one receive/change multipath descriptor. Permanent-label entry supports Tab and intentional grouping.',
  'Wallet deletion runs off the native UI thread and requires DELETE plus backup acknowledgement; software wallets also require separately backed-up passphrase acknowledgement. Funded software still needs native backup verification.',
  'Timelocked Recovery and Assisted recovery creation remain visibly unavailable. Receive-policy failures use the shared error notice and blue Open Policy action.',
  'Optional stable-release detection, Rust-owned signed-manifest installer preparation, and localized offline first-version notes. An installer is revealed only after the pinned owner key verifies the exact release manifest and the streamed installer digest.',
  'Current documentation is consolidated; obsolete scaffolding is removed. Public-site code remains in the separate website repository.'
] as const;
