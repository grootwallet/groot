# ADR 0004: Permanent labels and address retirement

- Status: accepted
- Date: 2026-07-17

## Context

Labels provide transaction context, while address reuse and abandoned invoices can harm privacy. A revealed address cannot safely be forgotten.

## Decision

Require a permanent label when revealing every external address. Allow discarding only while it is awaiting payment and has no observed transaction. Discard retires it from presentation but BDK continues monitoring it forever.

## Consequences

Label and derivation-index persistence must be atomic. There is no label-edit API. Late payments to retired addresses still appear with their original label.
