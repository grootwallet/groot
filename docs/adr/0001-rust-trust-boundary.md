# ADR 0001: Rust owns the wallet trust boundary

- Status: accepted
- Date: 2026-07-17

## Context

The Svelte UI runs in a webview. Mnemonics, decrypted seeds, private descriptors, transaction signing, and persistence require a smaller, auditable trust boundary.

## Decision

Rust/Tauri owns mnemonic generation/recovery, credential verification, BDK wallet construction, persistence, sync, transaction preparation, signing, and broadcast. Svelte receives typed DTOs only. It depends on `WalletPort`; Tauri commands implement that contract without exposing BDK types.

## Consequences

UI iteration stays fast and testable with a dummy adapter. Security-sensitive behavior is centralized. Command design and serialization require care, but mobile and desktop share one implementation.
