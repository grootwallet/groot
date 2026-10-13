# ADR 0085: Hardware app PIN changes and feedback follow-up

Status: accepted for internal testing, 2026-10-10. Refs #116.

Hardware single-sig and multisig app PINs protect local public-wallet access, not BIP39 derivation. Settings → Security allows a current-PIN-authenticated change, bound to the selected wallet. Software wallet credentials remain inseparable from their BIP39 passphrase and cannot be changed.

The native command runs off the UI thread, applies the existing authentication throttle and credential validation, and locks the selected wallet. Wallet verifier and protected node credentials are re-encrypted together. An owner-only, bounded, ciphertext-only rollback journal uses the existing atomic JSON writer. Interrupted changes restore the old encrypted files before credential verification; the old PIN remains usable. The journal is removed only after both replacements are durable. Existing secret, node, registry, database and backup formats are unchanged; old profiles need no migration. A successful change invalidates the old PIN. No wallet key, device PIN, device passphrase, descriptor or policy changes.

First-scan approval remains explicit and bound to the selected wallet. Genesis consent can retry after partial chain observations without requiring a credential for that public network operation. Untargeted changes on synced wallets and nonzero birthdays still require authentication. Genesis settings do not need a preliminary remote-tip request. The full scan remains authoritative; failures remain visible through WarningNotice and can be retried. Declining opens the existing Bitcoin Core connection dialog directly.

Creation forms no longer offer or automatically copy another wallet's network setup. Existing Settings reuse remains available. BIP329 recognizes matching xpub records separately from unsupported record types and preserves independently editable current signer names, as ADR 0084 intended. Address/transaction labels remain additive and atomic. This is a reporting correction, not a label-history or descriptor format change.

All UI uses existing components and semantic CSS tokens. Policy first-address details reuse HardwareAddressComparison, including its existing collapsible derivation rows. Untested timelocked creation remains disabled and now uses Coming soon with a policy description, matching Assisted recovery. Internal candidate identity is 5.2.0-rc02; published authorization and public gates remain unchanged.
