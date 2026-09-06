# ADR 0059: App-log inspection and shell continuity

- Status: accepted
- Date: 2026-09-06
- Supersedes: ADR 0058 only where it classified the viewer as outside the regular shell

## Context

ADR 0058 correctly isolates a fixed-field sanitized diagnostic record from wallet
data, but its presentation hides the normal unlocked navigation and gives the
complete event inventory permanent visual priority. Troubleshooting also requires
finding safe context quickly and inspecting the exact JSON without first exporting a
file.

## Decision

The user-facing feature is **App logs**. Settings remains its only normal entry and
the feature does not gain a separate desktop or mobile navigation item. Once opened,
however, it retains the regular unlocked shell and marks Settings current. The locked
shell remains restricted exactly as before.

The event inventory becomes optional insight behind the standard blue disclosure
label. The renderer may search the fixed returned fields and localized event label,
combine any closed-enum event filters, and order equal-timestamp records stably in
append order. It may display the current result as either the existing table or a
pretty-printed JSON array. Copying that sanitized JSON requires an explicit action and
passes through the bounded clipboard policy. Native JSON and CSV exports continue to
write the complete authoritative record list and retain their native reveal action.

## Compatibility and consequences

This changes only renderer presentation, shell routing, and an explicit clipboard
capability for already-sanitized records. The version-1 JSONL schema, log location,
size limit, event heuristics, native exports, wallet databases, profiles, registry,
backups, proposals, node settings, and secret envelopes are unchanged. Existing logs
need no migration. Exact-diff review confirmed that diagnostics remains a sync-paused
route, unlocked state gates regular shell visibility, locked access cannot expose
wallet navigation or node details, and no compiled-network or mainnet policy branch
changed. The three affected hash-pinned renderer sources advance together in the
mainnet source-policy snapshot. The BIP support matrix is unaffected.
