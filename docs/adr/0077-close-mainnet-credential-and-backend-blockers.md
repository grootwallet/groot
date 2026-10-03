# ADR 0077: Close Mainnet credential and backend blockers

- Status: partially superseded by ADR 0078
- Date: 2026-10-02
- Supersedes: ADR 0037's version-3 write format
- Superseded by: ADR 0078 for native final authorization and managed-backend policy

## Context

Three release blockers shared one property: a lower-trust component owned too
much authority. Mainnet signing credentials crossed the webview, portable
secret envelopes used an unversioned low-cost KDF profile, and the default
managed backend added an operator-controlled history and availability boundary.
The wallet credential remains deliberately both the BIP39 passphrase and Groot
unlock/signing credential for software wallets.

## Decision

- Mainnet final authorization collects software-wallet passphrases and app PINs
  in a bounded native secure field. The renderer sends `null`; Rust rejects a
  renderer-supplied Mainnet credential. Test networks retain the existing IPC
  flow until native entry is available on every supported platform.
- New protected secrets use portable envelope v4: Argon2id v1.3 with 64 MiB,
  three iterations, one lane, a 32-byte key, fresh salt/nonces, and distinct
  AES-GCM associated-data domains for payload and key wrapping. The exact KDF
  profile is stored and strictly validated before allocation.
- Correctly authenticated v2/v3 envelopes migrate atomically to v4. Wrong
  credentials, corruption, unsupported parameters, or write failure leave the
  original file unchanged. Version 1 continues through its existing authenticated
  compatibility reader and is rewritten as v4.
- The first Mainnet release accepts only explicitly configured user-controlled
  loopback HTTP or direct HTTPS Bitcoin Core. The fixed Groot gateway URL is
  rejected in Rust even with a custom username. Automatic enrollment, renewal,
  and the managed Settings option are removed. Existing managed files remain
  untouched but offline until the user saves an admitted Core setup.

## Consequences

No seed semantics, descriptor, transaction, wallet database, or recovery format
changes. The envelope migration affects software, hardware-only, multisig, and
protected RPC secrets on every network and is backward compatible. A copied
profile still permits offline guessing, so passphrase quality, full-disk
encryption, candidate KDF measurements, native-flow physical testing, and
independent review remain release requirements. Managed gateway code and ADR
0073 remain historical or future design evidence, not first-release authority.
