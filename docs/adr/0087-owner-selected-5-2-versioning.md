# ADR 0087: Owner-selected 5.2 version numbering

Status: Accepted for naming only; public distribution remains blocked.

The owner explicitly requested `5.2.0` and internal `5.2.0-rc03`. This supersedes ADR 0039's pre-1.0 numbering requirement for this release line only. The literal major number expresses the owner's release identity; it does not establish production readiness, platform certification, Mainnet authorization or compatibility with another wallet.

The version-surface gate accepts pre-1.0 versions as before, and exactly `5.2.0` or `5.2.0-rcNN`. It still requires identical package/Cargo/Tauri/frontend identity. Other major release lines need their own decision. Public builders still require the version/tag authorization, identical exact commit at HEAD/main/peeled annotated tag, independent reviewed-source hashes, signing and the release checklist. ADR 0083 and the public v0.5.1 authorization are unchanged. No source hash is refreshed to admit these edits. The required validation must report this existing release-policy blocker until independently reviewed and authorized.

There is no wallet-format or BIP impact. Public GA must wait for owner rc03 acceptance and real release signing/key material.
