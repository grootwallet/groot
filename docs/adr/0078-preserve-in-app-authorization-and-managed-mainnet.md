# ADR 0078: Preserve in-app authorization and managed Mainnet

- Status: accepted
- Date: 2026-10-02
- Supersedes: ADR 0077's native final-authorization and managed-backend decisions
- Reaffirms: ADR 0071 and ADR 0073

## Context

ADR 0077 changed established product behavior without product-owner approval. It
added native signing dialogs, removed managed-node enrollment and Settings, and
required user-controlled Core for Mainnet. Those changes harmed portability and
the intended wallet experience. Its portable envelope v4 decision remains valid.

## Decision

- Transaction review and credential entry remain in Groot's existing app UI on
  every network. No second native confirmation or signing-credential dialog is
  added. Software wallets use their BIP39 passphrase; hardware-only and multisig
  wallets use Groot's local app PIN, never the hardware device PIN or seed.
- Automatic managed-node enrollment, renewal, saved managed configurations, and
  the **Groot managed** Settings mode remain supported. **This Mac** and
  **Custom remote** remain alternatives, not Mainnet prerequisites.
- The managed service remains a disclosed privacy and availability boundary.
  Exact-chain, capability, response-bound, credential-protection, and no-silent-
  fallback checks remain mandatory.
- Native seed and recovery-word windows may be captured by the operating system.
  Groot warns that screenshots create sensitive copies, but does not prevent a
  user from taking one.
- Any future functional or user-visible security change requires explicit
  product-owner approval before implementation.

## Consequences

Credentials cross the bounded Tauri IPC boundary for the requested operation and
are cleared from UI state afterward. This accepts renderer compromise as a host-
compromise residual rather than imposing duplicate platform-specific dialogs.
The managed operator can observe connection metadata and wallet-history queries
and can affect availability, but cannot obtain recovery words, private keys, app
PINs, labels, or signing material. Users retain local and custom Core choices.

ADR 0081 supersedes portable envelope v4 with wallet/purpose-bound v5 and
authenticated v2/v3/v4 migration. Fee and amount caps,
canonical PSBT binding, stale-input rejection, multisig quorum intersection, and
strong active-chain broadcast evidence are unchanged. This decision changes no
descriptor, derivation, transaction, wallet database, backup, or proposal format.
