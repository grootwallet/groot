# Global CSS boundary

`src/app.css` is an ordered import list. Keep this order: the numbered files are contiguous parts of the previous stylesheet, not cascade layers. Moving a later override into an earlier file can change the UI.

Private rules belong in existing Svelte components and routes. The extraction retains selector weight with `:global(.name):where(.name)`; the local `:where` receives Svelte's hash. Descendant `:global` selectors are constrained by that local root and intentionally reach existing snippets/child components. Prefer ordinary scoped selectors for new code. Do not use unanchored global rules in a component to avoid the boundary.

## Remaining contracts

| Files                         | Global purpose                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `00-foundation.css`           | Font, dark tokens, reset, shared labels, focus, text selection                     |
| `10-shell.css`                | Cross-component shell contracts, shared tooltip appearance and icon motion         |
| `20-overview.css`             | Shared Button/empty-state/section/list/skeleton presentation classes               |
| `30-forms-and-send.css`       | Shared field, review, transaction and send patterns used by multiple owners        |
| `40-setup.css`                | Shared onboarding, public identifiers, forms and backup patterns                   |
| `50-hardware-policy.css`      | Shared hardware/policy presentation and public child-class overrides               |
| `60-wallet-details.css`       | Shared address/identifier, labels, coin and recovery patterns                      |
| `70-theme-and-responsive.css` | Light tokens, shared responsive overrides, reduced motion                          |
| `80-print.css`                | Public backup document and print window layout; fixed print colors are intentional |
| `90-policy-menu.css`          | Final shared policy menu/next-step overrides                                       |

These names preserve ordered sections; they do not grant permission to add new private rules there. The screen default hiding the public backup sheet stays global before `80-print.css`, so lazy route CSS cannot hide the printed document. Global animation names stay here so moved animation declarations keep working without a rename.

Shared raw `.button`, `.field`, `.empty-state` and `.readable-address` markup still has multiple existing consumers. Do not duplicate these rules into each consumer. Converting those call sites into the existing components is a separate markup change. `overview-inline-primary` stays next to the shared button cascade so mobile hiding wins regardless of lazy route CSS load order. The competing vault unit-margin override was removed: Amount now consistently owns its existing 0.5rem unit gap. Original captures showed both this gap and a roughly 4px smaller gap depending on lazy stylesheet order. The redundant hardware-preparation margin/padding rule was removed: the later shared credential warning already supplied the rendered values.

Child-supplied public classes remain explicit compatibility exceptions: `tx-chevron`, `row-chevron`, `draft-row-chevron`, `wallet-type-arrow`, `coin-timeline-note`, `delete-prerequisite`, `hardware-create-error`, `signature-requirement-action`, and `managed-privacy-warning`. They are passed to existing icons, Button or WarningNotice, so their callers cannot attach a local Svelte hash. Replace them with a narrow existing-component variant when changing the corresponding flow; do not silently turn them into unused scoped selectors.

No new reusable component, framework, dependency, wallet contract, persisted format or BIP behavior is introduced. Release source-policy pins and gates remain unchanged.
